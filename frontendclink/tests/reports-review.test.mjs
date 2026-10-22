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
function load(path, dependencies) {
  const compiled = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, AbortController, URLSearchParams,
    require: name => { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; } });
  return module.exports;
}

function harness() {
  const calls = { catalog: [], lists: [], details: [], files: [], saved: [] }, slots = [];
  let cursor = 0, effects = [], refreshes = 0;
  const auth = { status: 'ready', identity: { userId: 'admin-a', campusId: 'campus-a', profile: { estado_cuenta: 'ACTIVA' },
    roles: [{ name: 'ADMINISTRADOR', campusId: 'campus-a' }] }, refreshIdentity() { refreshes++; } };
  const react = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useEffect(effect, deps) { const index = cursor++, previous = slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) effects.push(() => {
        previous?.cleanup?.(); slots[index] = { deps, cleanup: effect() };
      }); },
  };
  const request = (bucket, data) => new Promise((resolve, reject) => bucket.push({ ...data, resolve, reject }));
  const { useReportReviews } = load('../src/features/reports/hooks/useReportReviews.ts', {
    react, '@/features/auth/hooks/useAuth': { useAuth: () => auth },
    '@/features/users/types/access': { canManageAccess: roles => roles.some(role => role.name === 'ADMINISTRADOR') },
    '@/features/users/api/accessApi': { loadAccessCampuses: signal => request(calls.catalog, { signal }) },
    '@/lib/api/authenticated-request': { AuthApiError }, '@/lib/files/saveFile': { saveFile: async (...args) => calls.saved.push(args) },
    '../api/reportsApi': {
      loadReportReviews: (campusId, page, signal) => request(calls.lists, { campusId, page, signal }),
      loadReportReview: (campusId, id, signal) => request(calls.details, { campusId, id, signal }),
      downloadReportedFile: (campusId, id, fileId, signal) => request(calls.files, { campusId, id, fileId, signal }),
    },
  });
  return { auth, calls, get refreshes() { return refreshes; }, render() { cursor = 0; const result = useReportReviews(); const work = effects; effects = []; work.forEach(effect => effect()); return result; } };
}
const page = rows => ({ data: rows, meta: { page: 1, limit: 20, hasMore: true } });
async function ready(h) {
  h.render(); h.calls.catalog[0].resolve([{ id: 'campus-a', name: 'Origen' }, { id: 'campus-b', name: 'Otra sede' }]);
  await setImmediate(); h.render(); h.calls.lists[0].resolve(page([{ id: 'report-a', title: 'Denuncia' }]));
  await setImmediate(); return h.render();
}

test('switching campus aborts old detail and clears evidence before the next response, stale requests cannot restore it', async () => {
  const h = harness(); let state = await ready(h);
  state.open('report-a'); h.render(); const previous = h.calls.details[0];
  state = h.render(); state.chooseCampus('campus-b'); state = h.render();
  assert.equal(state.detail, null); assert.equal(state.entries.length, 0); assert.equal(previous.signal.aborted, true);
  previous.resolve({ id: 'report-a', description: 'Private old evidence' }); await setImmediate();
  state = h.render(); assert.equal(state.detail, null);
  assert.equal(h.calls.lists.at(-1).campusId, 'campus-b'); assert.equal(h.calls.lists.at(-1).page, 1);
});
test('pagination reloads list and changing identity hides private evidence synchronously', async () => {
  const h = harness(); let state = await ready(h);
  state.changePage(2); h.render(); assert.equal(h.calls.lists.at(-1).page, 2);
  h.calls.lists.at(-1).resolve(page([{ id: 'next' }])); await setImmediate(); state = h.render();
  state.open('next'); h.render(); h.calls.details[0].resolve({ id: 'next', reporter: { name: 'Privado' } });
  await setImmediate(); assert.equal(h.render().detail.id, 'next');
  h.auth.identity.userId = 'admin-b'; state = h.render();
  assert.equal(state.detail, null); assert.equal(state.entries.length, 0); assert.equal(state.campuses.length, 0);
});
test('denied detail removes private state, refreshes identity and does not leave a previous report visible', async () => {
  const h = harness(); let state = await ready(h);
  state.open('report-a'); h.render(); h.calls.details[0].reject(new AuthApiError(403, 'Acceso revocado'));
  await setImmediate(); state = h.render(); assert.equal(state.detail, null); assert.equal(state.entries.length, 0); assert.equal(h.refreshes, 1);
  assert.equal(state.error, 'Acceso revocado'); assert.equal(state.loading, false);
  h.auth.identity.roles = [{ name: 'USUARIO_AUTORIZADO' }]; state = h.render(); assert.equal(state.allowed, false);
});
test('closing the case aborts file download and prevents saving late bytes', async () => {
  const h = harness(); let state = await ready(h);
  state.open('report-a'); h.render(); h.calls.details[0].resolve({ id: 'report-a' }); await setImmediate(); state = h.render();
  const pending = state.download('file-a', 'original.pdf'); const request = h.calls.files[0];
  state.close(); h.render(); assert.equal(request.signal.aborted, true);
  request.resolve(new Blob(['private'])); await pending; assert.equal(h.calls.saved.length, 0);
});
test('file errors offer retry and reporting-only users never request a moderation catalog', async () => {
  const h = harness(); let state = await ready(h);
  state.open('report-a'); h.render(); h.calls.details[0].resolve({ id: 'report-a' }); await setImmediate(); state = h.render();
  const pending = state.download('file-a', 'original.pdf'); h.calls.files[0].reject(new AuthApiError(503, 'Archivo no disponible')); await pending;
  assert.equal(h.render().error, 'Archivo no disponible');
  const other = harness(); other.auth.identity.roles = [{ name: 'USUARIO_AUTORIZADO' }]; other.auth.identity.permissions = [{ name: 'ACCEDER_REPORTERIA' }];
  assert.equal(other.render().allowed, false); assert.equal(other.calls.catalog.length, 0);
});
test('review screen presents snapshot and current agreement separately with private reporter and protected download action', () => {
  const labels = load('../src/features/reports/types/review.ts', {});
  const require = createRequire(import.meta.url);
  const view = ({ children }) => React.createElement('div', null, children);
  const { ReportReviews } = load('../src/features/reports/components/ReportReviews.tsx', {
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': { ActivityIndicator: view, Pressable: view, ScrollView: view, Text: view, View: view, StyleSheet: { create: value => value } },
    '@/components/navigation/BottomNavigationBar': { BottomNavigationBar: () => null }, '../types/review': labels,
    '../hooks/useReportReviews': { useReportReviews: () => ({ allowed: true, campuses: [], entries: [], selectedId: 'case',
      detail: { title: 'Título denunciado', status: 'PENDIENTE', reportedAt: '2026-10-22T12:00:00Z', reporter: { name: 'Denunciante privado' }, reason: 'Uso indebido',
        snapshot: { publication: { titulo: 'Original preservado', files: [{ id: 'file', name: 'evidencia.pdf' }] }, transaction: { estado_transaccion: 'RESERVADA' } },
        currentPublication: { title: 'Título editado', status: 'OCULTO' }, currentTransaction: { status: 'CANCELADA', receiver: { name: 'Receptor' } } } }) },
  });
  const markup = renderToStaticMarkup(React.createElement(ReportReviews));
  for (const text of ['Original preservado', 'Título editado', 'Denunciante privado', 'Contenido al momento', 'Antecedentes actuales', 'Receptor', 'Descargar evidencia.pdf']) assert.ok(markup.includes(text), text);
  assert.ok(!markup.includes('estado_transaccion')); assert.ok(!markup.includes('storage_path'));
});
