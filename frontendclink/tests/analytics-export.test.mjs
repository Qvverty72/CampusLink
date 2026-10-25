import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

class AuthApiError extends Error { constructor(status, serverMessage) { super(); this.status = status; this.serverMessage = serverMessage; } }
function load(path, dependencies, globals = {}) {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, AbortController, Uint8Array,
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
  assert.equal(pdf.blob, blob); assert.equal(pdf.file.name, 'campuslink-reporte-report/id.pdf');
  assert.equal(calls[0].path, '/api/v1/analytics/reports/report%2Fid/export/pdf'); assert.equal(calls[0].init.signal, signal);
  contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const excel = await downloadReport('saved-id', 'xlsx', signal);
  assert.equal(excel.file.extension, 'xlsx'); assert.equal(excel.file.mimeType, contentType);
  assert.equal(excel.file.uti, 'org.openxmlformats.spreadsheetml.sheet');
  assert.ok(calls.every(call => call.init.method === undefined && call.init.body === undefined));
  contentType = 'application/json'; await assert.rejects(() => downloadReport('saved-id', 'pdf', signal), /Formato/);
});

function harness() {
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
    react, '@/features/auth/hooks/useAuth': { useAuth: () => auth }, '@/lib/api/authenticated-request': { AuthApiError },
    '../types/access': load('../src/features/analytics/types/access.ts', {}),
    '../api/reportExportApi': { downloadReport: (id, format, signal) => new Promise((resolve, reject) => calls.push({ id, format, signal, resolve, reject })) },
    '@/lib/files/saveFile': { saveFile: async (...args) => { saves.push(args); } },
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
      assert.equal(h.render().error, 'No disponible.'); assert.equal(h.render().exporting, null);
    }
    assert.equal(h.refreshes, 2); assert.equal(h.saves.length, 1);
    const retry = h.render().exportFile('pdf'); assert.equal(h.render().error, '');
    h.calls.at(-1).resolve({ blob: new Blob(['pdf']), file: { id: 'saved-a', extension: 'pdf' } }); await retry;
    assert.equal(h.saves.length, 2); assert.equal(h.calls.at(-1).id, 'saved-a');
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
  const { ReportExportActions } = load('../src/features/analytics/components/ReportExportActions.tsx', {
    'react/jsx-runtime': require('react/jsx-runtime'), '../hooks/useReportExport': { useReportExport: id => { assert.equal(id, 'saved-id'); return state; } },
    'react-native': { ...native, Pressable: props => { actions.push(props); return React.createElement(native.Pressable, props); } },
  });
  const render = () => renderToStaticMarkup(React.createElement(ReportExportActions, { reportId: 'saved-id' }));
  let html = render(); assert.ok(html.includes('Exportar PDF')); assert.ok(html.includes('Exportar Excel'));
  actions[0].onPress(); actions[1].onPress(); assert.deepEqual(calls, ['pdf', 'xlsx']);
  state.exporting = 'xlsx'; actions.length = 0; html = render();
  assert.ok(html.includes('Preparando Excel')); assert.ok(actions.every(action => action.disabled));
  state.exporting = null; state.error = 'Permiso revocado'; html = render(); assert.ok(html.includes('role="alert"')); assert.ok(html.includes(state.error));
  state.allowed = false; assert.equal(render(), '');
});

function fileHarness(platform) {
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
    document: { createElement: () => link, body: { appendChild() {} } }, setTimeout: callback => timers.push(callback) });
  return { saveFile, written, shared, deleted, clicked, revoked, timers,
    unavailable() { available = false; }, failShare() { failShare = true; },
    failWrite() { failWrite = true; }, delayWrite() { let finish; writeGate = new Promise(resolve => { finish = resolve; }); return finish; } };
}
const descriptor = { id: 'saved-id', name: 'reporte.xlsx', extension: 'xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', uti: 'org.openxmlformats.spreadsheetml.sheet' };

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
