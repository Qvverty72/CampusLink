import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import { analyticsRenderer } from './helpers/analytics-render.mjs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

class AuthApiError extends Error { constructor(status, serverMessage) { super(); this.status = status; this.serverMessage = serverMessage; } }
function load(path, dependencies, globals = {}) {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, AbortController, Uint8Array, Error,
    ...globals, require: name => { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; } });
  return module.exports;
}

test('export API downloads authenticated binary bytes by ID/format without posting filters or results', async () => {
  const calls = [], signal = new AbortController().signal, blob = new Blob(['original bytes']);
  let contentType = 'application/pdf';
  const { downloadReport } = load('../src/features/analytics/api/reportExportApi.ts', {
    '@/lib/api/authenticated-request': { authenticatedResponseRequest: async (path, init) => {
      calls.push({ path, init }); return { headers: new Headers({ 'Content-Type': contentType }), blob: async () => blob };
    } },
  });
  const pdf = await downloadReport('report/id', 'pdf', signal);
  assert.equal(pdf.blob, blob); assert.equal(pdf.file.name, 'campuslink-reporte-report-id.pdf');
  assert.equal(calls[0].path, '/api/v1/analytics/reports/report%2Fid/export/pdf'); assert.equal(calls[0].init.signal, signal);
  contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const excel = await downloadReport('saved-id', 'xlsx', signal);
  assert.equal(excel.file.extension, 'xlsx'); assert.equal(excel.file.mimeType, contentType);
  assert.equal(excel.file.uti, 'org.openxmlformats.spreadsheetml.sheet');
  assert.ok(calls.every(call => call.init.method === undefined && call.init.body === undefined));
  contentType = 'application/json'; await assert.rejects(() => downloadReport('saved-id', 'pdf', signal), /Formato/);
});

function harness({ platform = 'ios', save } = {}) {
  const slots = [], calls = [], saves = []; let cursor = 0, effects = [], reportId = 'saved-a', refreshes = 0;
  const auth = { identity: { userId: 'user-a', campusId: 'campus-a', profile: { institucion_id: 'institution-a', estado_cuenta: 'ACTIVA' },
    roles: [{ name: 'ADMINISTRADOR', campusId: 'campus-a' }], permissions: [] }, refreshIdentity() { refreshes++; } };
  const react = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useEffect(effect, deps) { const index = cursor++, previous = slots[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) effects.push(() => {
        previous?.cleanup?.(); slots[index] = { deps, cleanup: effect() };
      }); },
  };
  const { useReportExport } = load('../src/features/analytics/hooks/useReportExport.ts', {
    react, 'react-native': { Platform: { OS: platform } }, '@/features/auth/hooks/useAuth': { useAuth: () => auth }, '@/lib/api/authenticated-request': { AuthApiError },
    '../types/access': load('../src/features/analytics/types/access.ts', {}),
    '../api/reportExportApi': { downloadReport: (id, format, signal) => new Promise((resolve, reject) => calls.push({ id, format, signal, resolve, reject })) },
    '@/lib/files/saveFile': { saveFile: async (...args) => { saves.push(args); await save?.(); } },
  });
  return { auth, calls, saves, get refreshes() { return refreshes; },
    select(id) { reportId = id; },
    render() { cursor = 0; const state = useReportExport(reportId), pending = effects; effects = []; pending.forEach(effect => effect()); return state; },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test('export hook delivers server bytes, prevents duplicate clicks, refreshes denied identity and permits explicit retry', async () => {
  const h = harness();
  try {
    h.render(); const first = h.render().exportFile('xlsx');
    assert.equal(h.render().exporting, 'xlsx'); await h.render().exportFile('pdf'); assert.equal(h.calls.length, 1);
    const saved = { blob: new Blob(['xlsx']), file: { id: 'saved-a', extension: 'xlsx' } };
    h.calls[0].resolve(saved); await first;
    assert.equal(h.saves[0][0], saved.blob); assert.equal(h.saves[0][1], saved.file); assert.equal(h.saves[0][2], h.calls[0].signal);
    assert.equal(h.render().exporting, null);
    for (const status of [401, 403, 503]) {
      const pending = h.render().exportFile('pdf'); h.calls.at(-1).reject(new AuthApiError(status, 'No disponible.')); await pending;
      assert.equal(h.render().error, status === 401 ? 'Tu sesión venció. Vuelve a iniciar sesión e inténtalo de nuevo.' : 'No disponible.'); assert.equal(h.render().exporting, null);
    }
    assert.equal(h.refreshes, 2); assert.equal(h.saves.length, 1);
    const retry = h.render().exportFile('pdf'); assert.equal(h.render().error, '');
    h.calls.at(-1).resolve({ blob: new Blob(['pdf']), file: { id: 'saved-a', extension: 'pdf' } }); await retry;
    assert.equal(h.saves.length, 2); assert.equal(h.calls.at(-1).id, 'saved-a');
  } finally { h.dispose(); }
});

test('download uses the server filename only when safe and never accepts a path or wrong extension', async () => {
  let filename = 'CampusLink_Reporte_Mensual_2026-09-01_2026-09-30_san-andres_12345678.pdf';
  const { downloadReport } = load('../src/features/analytics/api/reportExportApi.ts', {
    '@/lib/api/authenticated-request': { authenticatedResponseRequest: async () => ({
      headers: new Headers({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"` }), blob: async () => new Blob(['bytes']),
    }) },
  });
  const signal = new AbortController().signal;
  assert.equal((await downloadReport('safe-id', 'pdf', signal)).file.name, filename);
  for (filename of ['../../private.pdf', 'wrong.xlsx', 'x'.repeat(125) + '.pdf', 'unsafe name.pdf']) {
    assert.equal((await downloadReport('safe-id', 'pdf', signal)).file.name, 'campuslink-reporte-safe-id.pdf');
  }
});

test('export phases describe delivery without claiming a file was saved and expose actionable HTTP errors', async () => {
  for (const platform of ['ios', 'web']) {
    let finish; const h = harness({ platform, save: () => new Promise(resolve => { finish = resolve; }) });
    try {
      h.render(); const pending = h.render().exportFile('pdf'); assert.equal(h.render().phase, 'preparing');
      h.calls[0].resolve({ blob: 'bytes', file: {} }); await setImmediate(); assert.equal(h.render().phase, 'delivery');
      assert.equal(h.render().exporting, 'pdf'); finish(); await pending;
      assert.equal(h.render().exporting, null); assert.ok(h.render().notice.includes(platform === 'web' ? 'Descarga iniciada' : 'Si lo guardaste'));
      assert.ok(!h.render().notice.includes('Archivo guardado'));
      for (const [status, expected] of [[401, 'Tu sesión venció'], [403, 'todos los campus'], [404, 'ya no está disponible'], [503, 'No se pudo exportar']]) {
        const request = h.render().exportFile('pdf'); h.calls.at(-1).reject(new AuthApiError(status)); await request;
        assert.ok(h.render().error.includes(expected)); assert.equal(h.render().notice, '');
      }
    } finally { h.dispose(); }
  }
});

test('unavailable device sharing gives an actionable error without claiming a saved file', async () => {
  const message = 'Este dispositivo no permite guardar o compartir archivos desde la aplicación.';
  const h = harness({ save: async () => { throw new Error(message); } });
  try {
    h.render(); const request = h.render().exportFile('pdf'); h.calls[0].resolve({ blob: 'bytes', file: {} }); await request;
    assert.equal(h.render().error, message); assert.equal(h.render().notice, ''); assert.equal(h.render().exporting, null);
  } finally { h.dispose(); }
});

test('report changes, identity/permission changes and unmount cancel late exports before saving bytes', async () => {
  const h = harness();
  try {
    h.render(); const first = h.render().exportFile('pdf');
    h.select('saved-b'); h.render(); assert.equal(h.calls[0].signal.aborted, true); assert.equal(h.render().exporting, null);
    h.calls[0].resolve({ blob: 'late-a', file: {} }); await first; assert.equal(h.saves.length, 0);
    const second = h.render().exportFile('xlsx');
    h.auth.identity.userId = 'user-b'; h.render(); assert.equal(h.calls[1].signal.aborted, true);
    h.calls[1].resolve({ blob: 'late-user', file: {} }); await second; assert.equal(h.saves.length, 0);
    const third = h.render().exportFile('pdf');
    h.auth.identity.roles = []; assert.equal(h.render().allowed, false); assert.equal(h.calls[2].signal.aborted, true);
    h.calls[2].reject(new AuthApiError(403)); await third;
    await h.render().exportFile('pdf'); assert.equal(h.calls.length, 3); assert.equal(h.refreshes, 0);
    h.auth.identity.roles = [{ name: 'ADMINISTRADOR', campusId: 'campus-a' }]; h.render();
    const last = h.render().exportFile('pdf'); h.dispose();
    assert.equal(h.calls[3].signal.aborted, true); h.calls[3].resolve({ blob: 'late-unmount', file: {} }); await last;
    assert.equal(h.saves.length, 0);
  } finally { h.dispose(); }
});

test('export buttons select PDF/Excel, show progress/errors and respect reporting access', () => {
  const require = createRequire(import.meta.url), native = require('react-native-web'), actions = [], calls = [];
  const state = { allowed: true, exporting: null, error: '', exportFile: format => calls.push(format) };
  const { ReportExportActions } = analyticsRenderer({
    '@/features/analytics/hooks/useReportExport': { useReportExport: id => { assert.equal(id, 'saved-id'); return state; } },
  }, actions).load('src/features/analytics/components/ReportExportActions.tsx');
  const render = () => renderToStaticMarkup(React.createElement(ReportExportActions, { reportId: 'saved-id' }));
  let html = render(); assert.ok(html.includes('Descargar PDF')); assert.ok(html.includes('Descargar Excel'));
  assert.ok(html.includes('Las cifras guardadas, sin volver a calcularlas'));
  assert.ok(!html.includes('Para leer y compartir')); assert.ok(!html.includes('Para filtrar y analizar'));
  actions[0].onPress(); actions[1].onPress(); assert.deepEqual(calls, ['pdf', 'xlsx']);
  state.exporting = 'xlsx'; actions.length = 0; html = render();
  assert.ok(html.includes('Preparando Excel')); assert.ok(actions.every(action => action.disabled));
  assert.ok(html.includes('Espera a que termine la descarga de Excel.'));
  state.exporting = null; actions.length = 0;
  renderToStaticMarkup(React.createElement(ReportExportActions, { reportId: 'saved-id', reportLabel: 'reporte A' }));
  assert.ok(actions.some(action => action.accessibilityLabel === 'Descargar PDF del reporte A'));
  state.exporting = null; state.error = 'Permiso revocado'; html = render(); assert.ok(html.includes('role="alert"')); assert.ok(html.includes(state.error));
  state.allowed = false; assert.equal(render(), '');
});

function fileHarness(platform, globals = {}) {
  const written = [], shared = [], deleted = [], clicked = [], revoked = [], timers = [];
  let available = true, failShare = false, failWrite = false, writeGate;
  const link = { remove() { clicked.push('removed'); }, click() { clicked.push(this.download); } };
  const { saveFile } = load('../src/lib/files/saveFile.ts', {
    'react-native': { Platform: { OS: platform } },
    'expo-file-system': { Paths: { cache: 'cache' }, File: class {
      constructor(_root, name) { this.uri = `cache/${name}`; this.exists = true; }
      async write(bytes) {
        if (writeGate) await writeGate;
        if (failWrite) throw new Error('Write failed');
        written.push({ uri: this.uri, bytes: [...bytes] });
      }
      delete() { deleted.push(this.uri); }
    } },
    'expo-sharing': { isAvailableAsync: async () => available, shareAsync: async (uri, options) => {
      shared.push({ uri, options }); if (failShare) throw new Error('Share failed');
    } },
  }, { URL: { createObjectURL: () => 'blob:local', revokeObjectURL: url => revoked.push(url) },
    document: { createElement: () => link, body: { appendChild() {} } }, setTimeout: callback => timers.push(callback), ...globals });
  return { saveFile, written, shared, deleted, clicked, revoked, timers,
    unavailable() { available = false; }, failShare() { failShare = true; },
    failWrite() { failWrite = true; }, delayWrite() { let finish; writeGate = new Promise(resolve => { finish = resolve; }); return finish; } };
}
const descriptor = { id: 'saved-id', name: 'reporte.xlsx', extension: 'xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', uti: 'org.openxmlformats.spreadsheetml.sheet' };

function nativeReaderHarness() {
  const readers = [];
  class FileReader {
    result = null;
    error = null;
    readAsArrayBuffer(blob) { this.blob = blob; readers.push(this); }
    abort() { this.aborted = true; this.onabort?.(); }
  }
  return { FileReader, readers, complete(bytes) { readers[0].result = new Uint8Array(bytes).buffer; readers[0].onload?.(); },
    fail() { readers[0].error = new Error('Native read failed'); readers[0].onerror?.(); } };
}

test('iOS and Android export PDF/Excel from native Blobs without arrayBuffer and preserve exact bytes', async () => {
  for (const platform of ['ios', 'android']) for (const extension of ['pdf', 'xlsx']) {
    const reader = nativeReaderHarness(), h = fileHarness(platform, { FileReader: reader.FileReader });
    const blob = { data: { blobId: 'native-blob', size: 4 }, size: 4 };
    const file = extension === 'pdf' ? { ...descriptor, extension, mimeType: 'application/pdf', uti: 'com.adobe.pdf' } : descriptor;
    const pending = h.saveFile(blob, file); pending.catch(() => {});
    await setImmediate(); assert.equal(reader.readers.length, 1, 'native Blob must use FileReader');
    assert.equal(reader.readers[0].blob, blob); assert.equal(h.shared.length, 0);
    reader.complete([0, 37, 128, 255]); await pending;
    assert.deepEqual(h.written[0].bytes, [0, 37, 128, 255]);
    assert.equal(h.shared[0].options.mimeType, file.mimeType); assert.equal(h.shared[0].options.UTI, file.uti);
    assert.equal(h.deleted.length, 1);
  }
});

test('native FileReader cancellation aborts before writing or sharing, and read failures reach the caller', async () => {
  const reader = nativeReaderHarness(), h = fileHarness('ios', { FileReader: reader.FileReader });
  const controller = new AbortController(), blob = { data: { blobId: 'native' } };
  const pending = h.saveFile(blob, descriptor, controller.signal); pending.catch(() => {});
  await setImmediate(); assert.equal(reader.readers.length, 1);
  const aborted = assert.rejects(pending, { name: 'AbortError' }); controller.abort(); await aborted;
  assert.equal(reader.readers[0].aborted, true); reader.complete([1, 2]);
  assert.equal(h.written.length, 0); assert.equal(h.shared.length, 0);
  const failedReader = nativeReaderHarness(), failed = fileHarness('android', { FileReader: failedReader.FileReader });
  const failedSave = failed.saveFile(blob, descriptor); failedSave.catch(() => {}); await setImmediate();
  const rejection = assert.rejects(failedSave, /Native read failed/); failedReader.fail(); await rejection;
  assert.equal(failed.written.length, 0); assert.equal(failed.shared.length, 0);
});

test('web saves exact blobs with a download name and releases the object URL', async () => {
  const h = fileHarness('web'); await h.saveFile(new Blob(['bytes']), descriptor);
  assert.deepEqual(h.clicked, ['reporte.xlsx', 'removed']); h.timers.forEach(callback => callback()); assert.deepEqual(h.revoked, ['blob:local']);
  assert.equal(h.written.length, 0); assert.equal(h.shared.length, 0);
});

test('native file saving uses correct Excel/PDF MIME and UTI and cleans cache after success or failure', async () => {
  const h = fileHarness('android'), blob = new Blob([new Uint8Array([1, 2, 3])]);
  await h.saveFile(blob, descriptor);
  assert.deepEqual(h.written[0].bytes, [1, 2, 3]); assert.equal(h.written[0].uri, 'cache/campuslink-saved-id.xlsx');
  assert.equal(h.shared[0].options.mimeType, descriptor.mimeType); assert.equal(h.shared[0].options.UTI, descriptor.uti);
  assert.deepEqual(h.deleted, ['cache/campuslink-saved-id.xlsx']);
  h.failShare(); await assert.rejects(() => h.saveFile(blob, { ...descriptor, extension: 'pdf', mimeType: 'application/pdf', uti: 'com.adobe.pdf' }));
  assert.equal(h.deleted.at(-1), 'cache/campuslink-saved-id.pdf');
  h.unavailable(); await assert.rejects(() => h.saveFile(blob, descriptor)); assert.equal(h.written.length, 2);
});

test('cancellation while obtaining native bytes prevents local writes and sharing', async () => {
  const h = fileHarness('ios'), controller = new AbortController(); let finish;
  const pending = h.saveFile({ arrayBuffer: () => new Promise(resolve => { finish = resolve; }) }, descriptor, controller.signal);
  await setImmediate(); controller.abort(); finish(new Uint8Array([1]).buffer); await pending;
  assert.equal(h.written.length, 0); assert.equal(h.shared.length, 0);
});

test('SDK 58 async writing finishes before sharing and cleanup', async () => {
  const h = fileHarness('ios'), finish = h.delayWrite();
  const pending = h.saveFile(new Blob(['pdf']), descriptor);
  await setImmediate();
  assert.equal(h.shared.length, 0); assert.equal(h.deleted.length, 0);
  finish(); await pending;
  assert.equal(h.written.length, 1); assert.equal(h.shared.length, 1); assert.equal(h.deleted.length, 1);
});

test('cancellation during async writing skips sharing and still cleans the completed file', async () => {
  const h = fileHarness('ios'), finish = h.delayWrite(), controller = new AbortController();
  const pending = h.saveFile(new Blob(['pdf']), descriptor, controller.signal);
  await setImmediate(); controller.abort(); finish(); await pending;
  assert.equal(h.written.length, 1); assert.equal(h.shared.length, 0); assert.equal(h.deleted.length, 1);
});

test('async write rejection reaches the caller without opening sharing', async () => {
  const h = fileHarness('android'); h.failWrite();
  await assert.rejects(() => h.saveFile(new Blob(['pdf']), descriptor), /Write failed/);
  assert.equal(h.shared.length, 0); assert.equal(h.deleted.length, 1);
});

test('existing digital PDF download delegates to the shared saver with its original contract', async () => {
  let args;
  const { saveDigitalFile } = load('../src/features/marketplace/elibrary/api/saveDigitalFile.ts', {
    '@/lib/files/saveFile': { saveFile: async (...values) => { args = values; } },
  });
  const blob = new Blob(['pdf']); await saveDigitalFile(blob, { id: 'digital-id', name: 'material.pdf' });
  assert.equal(args[0], blob); assert.equal(args[1].mimeType, 'application/pdf'); assert.equal(args[1].extension, 'pdf');
  assert.equal(args[1].uti, 'com.adobe.pdf'); assert.equal(args[1].id, 'digital-id');
});
