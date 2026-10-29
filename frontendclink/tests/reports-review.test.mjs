import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { analyticsRenderer } from './helpers/analytics-render.mjs';

function renderReview(state) {
  const native = createRequire(import.meta.url)('react-native-web');
  const noop = () => {};
  const defaults = { allowed: true, statusFilter: '', identityKey: 'fixture', campuses: [{ id: 'campus-a', name: 'San Andrés' }], campusId: 'campus-a',
    entries: [], page: 1, hasMore: false, detail: null, selectedId: null, canResolve: false,
    resolutionInput: { decision: null, justification: '' }, applyFilters: noop, chooseCampus: noop, changePage: noop, retry: noop, close: noop };
  return analyticsRenderer({
    'react-native': { ...native, useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }), Modal: ({ visible, children }) => visible ? React.createElement(native.View, null, children) : null },
    'expo-router': { router: { push: noop } },
    '../hooks/useReportReviews': { useReportReviews: () => ({ ...defaults, ...state }) },
  }).render('src/features/reports/components/ReportReviews.tsx', 'ReportReviews');
}

function renderOriginal(detail, extra = {}) {
  return analyticsRenderer().render('src/features/reports/components/ReportOriginalContent.tsx', 'ReportOriginalContent', {
    review: { detail, download() {}, downloading: false, ...extra },
  });
}

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
  const calls = { catalog: [], lists: [], details: [], historyLists: [], historyDetails: [], files: [], resolutions: [], saved: [] }, slots = [];
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
      loadReportReviews: (campusId, page, signal, status) => request(calls.lists, { campusId, page, signal, status }),
      loadReportReview: (campusId, id, signal) => request(calls.details, { campusId, id, signal }),
      loadReportResolutions: (campusId, page, signal) => request(calls.historyLists, { campusId, page, signal }),
      loadReportResolution: (campusId, id, signal) => request(calls.historyDetails, { campusId, id, signal }),
      downloadReportedFile: (campusId, id, fileId, signal) => request(calls.files, { campusId, id, fileId, signal }),
      submitReportResolution: (campusId, id, input, signal) => request(calls.resolutions, { campusId, id, input, signal }),
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

async function openPending(h, detail = { id: 'report-a', status: 'PENDIENTE', resolution: null }) {
  const state = await ready(h); state.open('report-a'); h.render(); h.calls.details[0].resolve(detail);
  await setImmediate(); return h.render();
}

test('applying status resets pagination and aborts old detail/list; late responses cannot restore another filter', async () => {
  const h = harness(); let state = await ready(h);
  state.changePage(2); h.render(); h.calls.lists.at(-1).resolve(page([{ id: 'old' }])); await setImmediate();
  state = h.render(); state.open('old'); h.render(); const previous = h.calls.details.at(-1);
  state = h.render(); state.applyFilters({ campusId: 'campus-a', status: 'RESUELTO' }); state = h.render();
  assert.equal(state.page, 1); assert.equal(state.detail, null); assert.equal(state.entries.length, 0); assert.equal(previous.signal.aborted, true);
  assert.equal(h.calls.lists.at(-1).status, 'RESUELTO'); assert.equal(h.calls.historyLists.length, 0);
  const resolvedList = h.calls.lists.at(-1);
  state.applyFilters({ campusId: 'campus-b', status: 'DESESTIMADO' }); h.render();
  assert.equal(resolvedList.signal.aborted, true);
  previous.resolve({ id: 'old', description: 'Private old evidence' }); resolvedList.resolve(page([{ id: 'stale' }])); await setImmediate();
  state = h.render(); assert.equal(state.detail, null); assert.equal(state.entries.length, 0);
  assert.equal(h.calls.lists.at(-1).campusId, 'campus-b'); assert.equal(h.calls.lists.at(-1).status, 'DESESTIMADO');
  h.calls.lists.at(-1).resolve(page([{ id: 'final' }])); await setImmediate(); state = h.render(); state.open('final'); h.render();
  h.calls.details.at(-1).resolve({ id: 'final', status: 'DESESTIMADO', resolution: { measure: 'NINGUNA', justification: 'Original' } });
  await setImmediate(); state = h.render(); assert.equal(state.canResolve, false);
  state.requestResolution(); await state.confirmResolution(); await state.download('file', 'evidence.pdf');
  assert.equal(h.calls.resolutions.length, 0); assert.equal(h.calls.files.length, 0);
  h.auth.identity.userId = 'another-reader'; state = h.render(); assert.equal(state.entries.length, 0); assert.equal(state.campuses.length, 0); assert.equal(state.statusFilter, '');
});

test('filtered resolution preserves result until close, then refreshes page one when case no longer matches', async () => {
  const h = harness(); let state = await ready(h);
  state.applyFilters({ campusId: 'campus-a', status: 'PENDIENTE' }); h.render();
  h.calls.lists.at(-1).resolve(page([{ id: 'report-a', status: 'PENDIENTE' }])); await setImmediate(); state = h.render();
  state.open('report-a'); h.render(); h.calls.details.at(-1).resolve({ id: 'report-a', status: 'PENDIENTE' }); await setImmediate(); state = h.render();
  state.editResolution({ decision: 'DESESTIMAR', justification: 'Sin antecedentes suficientes' }); state = h.render(); state.requestResolution(); state = h.render();
  const writing = state.confirmResolution(); h.calls.resolutions[0].resolve({ id: 'report-a', status: 'DESESTIMADO', resolution: { measure: 'NINGUNA', justification: 'Original' } }); await writing;
  state = h.render(); assert.equal(state.detail.status, 'DESESTIMADO'); assert.equal(state.canResolve, false);
  const count = h.calls.lists.length; state.close(); state = h.render(); assert.equal(state.detail, null); assert.equal(state.entries.length, 0);
  assert.equal(h.calls.lists.length, count + 1); assert.equal(h.calls.lists.at(-1).status, 'PENDIENTE'); assert.equal(h.calls.lists.at(-1).page, 1);
});

test('unified API sends optional status to the server and retains authenticated cancellation', async () => {
  const calls = [], signal = new AbortController().signal;
  const request = (...args) => { calls.push(args); return Promise.resolve({ data: [] }); };
  const api = load('../src/features/reports/api/reportsApi.ts', { '@/lib/api/authenticated-request': { authenticatedEnvelopeRequest: request, authenticatedRequest: request } });
  await api.loadReportReviews('campus/id', 2, signal, 'EN_REVISION'); await api.loadReportReviews('campus/id', 1, signal);
  assert.equal(calls[0][0], '/api/v1/reports/campuses/campus%2Fid'); assert.equal(calls[0][2].toString(), 'page=2&limit=20&status=EN_REVISION');
  assert.equal(calls[0][1].signal, signal); assert.equal(calls[1][2].has('status'), false);
});

test('unified final details preserve the recorded decision, with current contacts separately identified and no write/download actions', () => {
  const resolution = { measure: 'OCULTAR', justification: 'Justificación original', resolvedById: 'admin-original', resolvedAt: '2026-10-22T12:00:00Z' };
  const state = { entries: [{ id: 'case', title: 'Contenido', entityType: 'ACTIVIDAD', status: 'RESUELTO', resolution }] };
  let markup = renderReview(state);
  for (const text of ['Ver resolución', 'admin-original', 'Decisión', 'ocultar contenido']) assert.ok(markup.includes(text), text);
  assert.ok(!markup.includes('role="tab"'));
  state.selectedId = 'case'; state.detail = { id: 'case', title: 'Contenido', status: 'RESUELTO', reason: 'Motivo original', resolution,
    reporter: { name: 'Nombre actual no histórico' }, snapshot: { publication: { titulo: 'Título guardado', files: [{ id: 'file', name: 'private.pdf' }] } },
    currentPublication: { title: 'Contenido vivo' }, currentTransaction: { status: 'CANCELADA' } };
  markup = renderReview(state);
  for (const text of ['Justificación original', 'Motivo original', 'Título guardado', 'Responsable registrado', 'Nombre no disponible']) assert.ok(markup.includes(text), text);
  for (const text of ['Nombre actual no histórico', 'Contenido vivo', 'Situación actual', 'Descargar', 'Resolver denuncia', '<textarea']) assert.ok(!markup.includes(text), text);
  assert.ok(markup.indexOf('Resolución registrada') < markup.indexOf('Ver publicación como fue denunciada'));
  state.detail.resolution = { measure: null, justification: null, resolvedById: null, resolvedAt: null };
  markup = renderReview(state); for (const text of ['Fecha no registrada', 'Sin medida registrada', 'Sin responsable registrado']) assert.ok(markup.includes(text), text);
});

test('compact card dates use report age for open cases and the original decision date for finals, preserving missing values', () => {
  const { reportCardDate } = load('../src/features/reports/utils/reportPresentation.ts', {
    '@/features/activities/types/activityReport': { ACTIVITY_REPORT_REASONS: [] }, '../types/review': { reviewLabels: {} },
  });
  const now = Date.parse('2026-10-28T12:00:00Z');
  const entry = { status: 'PENDIENTE', reportedAt: '2026-10-25T12:00:00Z', resolution: null };
  assert.equal(reportCardDate(entry, now), 'hace 3 días');
  assert.equal(reportCardDate({ ...entry, reportedAt: '2026-10-28T11:59:50Z' }, now), 'ahora');
  assert.equal(reportCardDate({ ...entry, reportedAt: '2026-10-27T12:00:00Z' }, now), 'hace 1 día');
  assert.ok(!reportCardDate({ ...entry, reportedAt: '2026-10-29T12:00:00Z' }, now).includes('hace'));
  const final = { ...entry, status: 'DESESTIMADO', resolution: { resolvedAt: '2026-10-23T12:00:00Z' } };
  assert.match(reportCardDate(final, now), /desestimada el 23.*oct/i);
  assert.match(reportCardDate({ ...final, status: 'RESUELTO' }, now), /resuelta el 23.*oct/i);
  assert.equal(reportCardDate({ ...final, resolution: { resolvedAt: null } }, now), 'Fecha de decisión no registrada');
  assert.equal(reportCardDate({ ...entry, reportedAt: 'invalid' }, now), 'Fecha no registrada');
  assert.match(reportCardDate({ ...final, resolution: { resolvedAt: '2025-10-23T12:00:00Z' } }, now), /2025/);
});

test('history API uses authenticated read-only routes and forwards pagination and cancellation', async () => {
  const calls = [], signal = new AbortController().signal;
  const request = (...args) => { calls.push(args); return Promise.resolve({ data: [] }); };
  const api = load('../src/features/reports/api/reportsApi.ts', {
    '@/lib/api/authenticated-request': { authenticatedEnvelopeRequest: request, authenticatedRequest: request, authenticatedResponseRequest: request },
  });
  await api.loadReportResolutions('campus/id', 2, signal); await api.loadReportResolution('campus/id', 'case/id', signal);
  assert.equal(calls[0][0], '/api/v1/reports/campuses/campus%2Fid/resolutions');
  assert.equal(calls[0][2].toString(), 'page=2&limit=20'); assert.equal(calls[0][1].signal, signal);
  assert.equal(calls[1][0], '/api/v1/reports/campuses/campus%2Fid/resolutions/case%2Fid');
  assert.equal(calls[1][1].signal, signal); assert.equal(calls[1][1].method, undefined);
});

test('resolution requires justification and confirmation, prevents double submit and updates detail/list from server response', async () => {
  const h = harness(); let state = await openPending(h);
  assert.equal(state.resolutionInput.decision, null);
  state.requestResolution(); state = h.render(); assert.match(state.resolutionError, /decisión/); assert.equal(h.calls.resolutions.length, 0);
  state.editResolution({ decision: 'ACOGER' }); state = h.render(); state.requestResolution(); state = h.render(); assert.match(state.resolutionError, /justificación/);
  state.editResolution({ decision: 'ACOGER', justification: 'Medida necesaria tras revisión.' }); state = h.render();
  state.requestResolution(); state = h.render(); assert.equal(state.confirmingResolution, true); assert.equal(h.calls.resolutions.length, 0);
  const pending = state.confirmResolution(); void state.confirmResolution(); assert.equal(h.calls.resolutions.length, 1);
  const request = h.calls.resolutions[0]; assert.equal(request.campusId, 'campus-a'); assert.equal(request.id, 'report-a'); assert.equal(request.input.decision, 'ACOGER');
  request.resolve({ id: 'report-a', status: 'RESUELTO', resolution: { justification: request.input.justification, measure: 'OCULTAR' } });
  await pending; state = h.render(); assert.equal(state.detail.status, 'RESUELTO'); assert.equal(state.entries[0].status, 'RESUELTO'); assert.equal(state.canResolve, false);
  assert.equal(state.confirmingResolution, false); assert.equal(state.resolving, false);
});

test('failed resolution preserves draft and requires case refresh before another submission; stored activity decision is read-only', async () => {
  const h = harness(); let state = await openPending(h);
  state.editResolution({ decision: 'ACOGER', justification: 'Decisión original' }); state = h.render(); state.requestResolution(); state = h.render();
  const pending = state.confirmResolution(); h.calls.resolutions[0].reject(new AuthApiError(503, 'Recarga la denuncia para confirmar su estado.'));
  await pending; state = h.render(); assert.equal(state.resolutionNeedsReload, true); assert.equal(state.resolutionInput.justification, 'Decisión original');
  state.requestResolution(); state = h.render(); await state.confirmResolution(); assert.equal(h.calls.resolutions.length, 1);
  state.retry(); h.render(); h.calls.details.at(-1).resolve({ id: 'report-a', status: 'EN_REVISION', resolution: { measure: 'OCULTAR', justification: 'Decisión original' } });
  await setImmediate(); state = h.render(); assert.equal(state.resolutionInProgress, true); assert.equal(state.resolutionNeedsReload, false);
  state.editResolution({ decision: 'DESESTIMAR', justification: 'Otra' }); state = h.render();
  assert.equal(state.resolutionInput.decision, 'ACOGER'); assert.equal(state.resolutionInput.justification, 'Decisión original');
});

test('changing campus cancels resolution response and cannot display a late result from another case', async () => {
  const h = harness(); let state = await openPending(h);
  state.editResolution({ decision: 'DESESTIMAR', justification: 'Sin mérito' }); state = h.render(); state.requestResolution(); state = h.render();
  const pending = state.confirmResolution(); const request = h.calls.resolutions[0];
  state.chooseCampus('campus-b'); state = h.render(); assert.equal(request.signal.aborted, true); assert.equal(state.detail, null);
  request.resolve({ id: 'report-a', status: 'DESESTIMADO', resolution: { justification: 'Privado' } }); await pending;
  state = h.render(); assert.equal(state.detail, null); assert.equal(state.canResolve, false); assert.equal(state.resolutionInput.justification, '');
});

test('permission revocation during resolution removes evidence and presents the server denial', async () => {
  const h = harness(); let state = await openPending(h);
  state.editResolution({ decision: 'DESESTIMAR', justification: 'Sin mérito' }); state = h.render(); state.requestResolution(); state = h.render();
  const pending = state.confirmResolution(); h.calls.resolutions[0].reject(new AuthApiError(403, 'Permiso revocado'));
  await pending; state = h.render(); assert.equal(state.detail, null); assert.equal(state.canResolve, false); assert.equal(state.error, 'Permiso revocado'); assert.equal(h.refreshes, 1);
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
  const detail = { title: 'Título denunciado', status: 'PENDIENTE', reportedAt: '2026-10-22T12:00:00Z', reporter: { name: 'Denunciante privado' }, reason: 'Uso indebido',
        snapshot: { publication: { titulo: 'Original preservado', files: [{ id: 'file', name: 'evidencia.pdf' }], storage_path: 'secret-path' }, transaction: { estado_transaccion: 'RESERVADA' } },
        currentPublication: { title: 'Título editado', status: 'OCULTO' }, currentTransaction: { status: 'CANCELADA', receiver: { name: 'Receptor' } } };
  const markup = renderReview({ selectedId: 'case', detail });
  for (const text of ['Original preservado', 'Título editado', 'Antecedentes actuales', 'Receptor', 'Denunciante privado']) assert.ok(markup.includes(text), text);
  assert.ok(!markup.includes('Referencias del caso')); assert.ok(!markup.includes('Descargar evidencia.pdf'));
  const original = renderOriginal(detail);
  for (const text of ['Original preservado', 'Registro original', 'Intercambio al denunciar', 'Descargar evidencia.pdf']) assert.ok(original.includes(text), text);
  for (const text of ['Título editado', 'Denunciante privado', 'Receptor', 'estado_transaccion', 'storage_path', 'secret-path']) assert.ok(!original.includes(text), text);
});

test('real resolution screen shows mandatory justification and confirmation, and replaces controls with the recorded decision after completion', () => {
  const state = { selectedId: 'case', canResolve: true,
    confirmingResolution: false, resolutionInput: { decision: 'ACOGER', justification: 'Uso indebido comprobado' },
    detail: { id: 'case', status: 'PENDIENTE', title: 'Contenido', reporter: { name: 'Privado' }, reportedAt: '2026-10-22T12:00:00Z' } };
  let markup = renderReview(state);
  assert.ok(markup.includes('Justificación obligatoria')); assert.ok(markup.includes('Quedará registrada con tu usuario y la fecha')); assert.ok(markup.includes('<textarea'));
  state.confirmingResolution = true; markup = renderReview(state);
  for (const text of ['Confirmar y ocultar', 'Volver a editar', 'solicitudes, transacciones, archivos y accesos adquiridos se conservan', 'resolución será definitiva']) assert.ok(markup.includes(text), text);
  assert.ok(!markup.includes('<textarea'));
  state.canResolve = false; state.detail.status = 'RESUELTO';
  state.detail.resolution = { measure: 'OCULTAR', justification: 'Uso indebido comprobado', resolvedById: 'admin-original', resolvedAt: '2026-10-22T12:00:00Z' };
  markup = renderReview(state);
  for (const text of ['Resolución registrada', 'Uso indebido comprobado', 'Responsable registrado']) assert.ok(markup.includes(text), text);
  assert.ok(!markup.includes('Confirmar y ocultar')); assert.ok(!markup.includes('<textarea'));
});

test('task-specific errors stay separate and file download locks immediately before a rerender', async () => {
  const h = harness(); let state = await ready(h);
  assert.equal(state.catalogLoading, false); assert.equal(state.listLoading, false); assert.equal(state.detailLoading, false);
  state.open('report-a'); state = h.render(); assert.equal(state.detailLoading, true); assert.equal(state.listLoading, false);
  h.calls.details[0].resolve({ id: 'report-a' }); await setImmediate(); state = h.render();
  const first = state.download('file-a', 'original.pdf'); await state.download('file-a', 'original.pdf'); assert.equal(h.calls.files.length, 1);
  h.calls.files[0].reject(new AuthApiError(503, 'Archivo temporalmente no disponible')); await first; state = h.render();
  assert.equal(state.downloadFileId, 'file-a'); assert.equal(state.downloadError, 'Archivo temporalmente no disponible');
  assert.equal(state.listError, ''); assert.equal(state.detailError, ''); assert.equal(state.detail.id, 'report-a');
  state.close(); h.render(); state = h.render(); state.open('report-a'); h.render(); h.calls.details.at(-1).resolve({ id: 'report-a' });
  await setImmediate(); state = h.render(); assert.equal(state.downloadError, '');
  const second = state.download('file-b', 'otro.pdf'); h.calls.files.at(-1).resolve(new Blob(['fixture'])); await second;
  assert.equal(h.calls.saved.length, 1);
});

test('list translates coded reasons without creating historical names or a pending-only inbox', () => {
  const markup = renderReview({ entries: [{ id: 'report-123456', entityType: 'TRANSACCION', entityId: 'private-target', reason: 'ACTIVITY_SPAM', status: 'PENDIENTE', title: 'Intercambio original', reportedAt: '2026-10-28T12:00:00Z' }] });
  for (const text of ['Spam o publicidad no relacionada', 'Intercambio', '123456', 'Denuncias del campus', 'Filtros', 'Todas las denuncias']) assert.ok(markup.includes(text), text);
  for (const text of ['ACTIVITY_SPAM', 'private-target', 'Última página', 'Nombre del administrador']) assert.ok(!markup.includes(text), text);
});

test('empty, failed, denied and unassigned states never imply an empty successful list', () => {
  const failed = renderReview({ listError: 'Servidor no disponible' });
  assert.ok(failed.includes('No pudimos cargar las denuncias')); assert.ok(!failed.includes('No hay denuncias en este campus'));
  const loading = renderReview({ detailLoading: true, selectedId: 'case' }); assert.ok(loading.includes('Abriendo denuncia'));
  const denied = renderReview({ accessDenied: 'Permiso revocado', detail: { title: 'Datos privados' }, selectedId: 'case' });
  assert.ok(denied.includes('Tu acceso cambió')); assert.ok(!denied.includes('Datos privados'));
  assert.ok(renderReview({ campuses: [] }).includes('Sin campus disponibles'));
});

test('durable decision is presented as incomplete and final cases keep the recorded measure above evidence', () => {
  const resolution = { measure: 'OCULTAR', justification: 'Decisión original', resolvedById: 'original-admin', resolvedAt: '2026-10-28T12:00:00Z' };
  const state = { selectedId: 'case', canResolve: true, resolutionInProgress: true, resolutionInput: { decision: 'ACOGER', justification: resolution.justification },
    detail: { id: 'case', status: 'EN_REVISION', entityType: 'ACTIVIDAD', title: 'Actividad', reporter: { id: 'reporter' }, snapshot: null, resolution } };
  let markup = renderReview(state);
  assert.ok(markup.includes('Decisión registrada; falta completar el cierre')); assert.ok(markup.includes('Responsable registrado'));
  assert.ok(!markup.includes('<textarea')); assert.ok(!markup.includes('role="radio"'));
  state.detail.status = 'RESUELTO'; state.canResolve = false; markup = renderReview(state);
  assert.ok(markup.indexOf('Resolución registrada') < markup.indexOf('Ver actividad como fue denunciada'));
  assert.ok(renderOriginal(state.detail).includes('Sin antecedentes registrados')); assert.ok(!markup.includes('Completar resolución'));
});

test('pending decision controls follow the original-content disclosure, while final cases remain read-only even with stale UI flags', () => {
  const detail = { id: 'case', title: 'Contenido', status: 'PENDIENTE', entityType: 'PUBLICACION_FISICA',
    reportedAt: '2026-10-16T17:09:00Z', reason: 'Motivo original', description: 'Comentario original', snapshot: null };
  const state = { selectedId: 'case', detail, canResolve: true };
  let markup = renderReview(state);
  assert.ok(markup.indexOf('Denuncia enviada') < markup.indexOf('Ver publicación como fue denunciada'));
  assert.ok(markup.indexOf('Ver publicación como fue denunciada') < markup.indexOf('Resolver denuncia'));
  assert.ok(!markup.includes('Resolución registrada')); assert.ok(markup.includes('Comentario original'));
  detail.status = 'RESUELTO'; markup = renderReview(state);
  assert.ok(markup.includes('Resolución registrada')); assert.ok(markup.includes('Sin justificación registrada'));
  assert.ok(!markup.includes('<textarea')); assert.ok(!markup.includes('Resolver denuncia'));
});

test('original preview preserves zero price and saved state/edition without loading images or reconstructing absent data', () => {
  const detail = { id: 'case', title: 'Título de resumen', status: 'RESUELTO', entityType: 'PUBLICACION_FISICA', reportedAt: '2026-10-16T17:09:00Z',
    snapshot: { publication: { titulo: 'Calculadora original', tipo_recurso: 'FISICO', modalidad: 'VENTA', precio: '0.00', moneda: 'CLP', estado_uso: 'USADO', estado_publicacion: 'DISPONIBLE',
      updated_at: '2026-10-16T17:08:00Z', images: [{ id: 'image', url: 'https://secret.invalid/file', storage_path: 'private/storage' }], files: [{ id: 'file', name: 'Original.pdf', mimeType: { invalid: 'hidden' } }] } },
    resolution: { measure: 'OCULTAR' }, currentPublication: { title: 'Actual', price: 999999, status: 'OCULTO' } };
  const markup = renderOriginal(detail);
  for (const text of ['Calculadora original', '$0', 'Usado', 'Disponible', 'Última edición guardada', '1 imagen registrada', 'Original.pdf']) assert.ok(markup.includes(text), text);
  for (const text of ['secret.invalid', 'private/storage', '999999', 'Descargar', '<img']) assert.ok(!markup.includes(text), text);
  assert.ok(renderOriginal({ ...detail, snapshot: null }).includes('Sin antecedentes registrados'));
});

test('case contacts appear beside their roles, with no technical references panel or extra original-content controls', () => {
  const detail = { id: 'private-case-id', entityType: 'PUBLICACION_FISICA', title: 'Objeto denunciado', status: 'RESUELTO', reason: 'Motivo original',
    reporter: { id: 'private-reporter-id', name: null }, snapshot: null,
    resolution: { measure: 'OCULTAR', justification: 'Fundamento original', resolvedById: 'private-decision-id' },
    people: { source: 'CURRENT_PROFILE',
      reported: { id: 'private-owner-id', name: 'Nombre denunciado', email: 'denunciado@example.test' },
      reporter: { id: 'private-reporter-id', name: 'Nombre denunciante', email: 'denunciante@example.test' },
      decisionMaker: { id: 'private-decision-id', name: 'Nombre responsable', email: 'responsable@example.test' } } };
  const markup = renderReview({ selectedId: detail.id, detail });
  for (const text of ['Nombre denunciado', 'denunciado@example.test', 'Nombre denunciante', 'denunciante@example.test', 'Nombre responsable', 'responsable@example.test', 'perfiles actuales']) assert.ok(markup.includes(text), text);
  assert.ok(markup.indexOf('Nombre denunciado') < markup.indexOf('Historial del caso'));
  assert.ok(markup.indexOf('Denuncia enviada') < markup.indexOf('Nombre denunciante'));
  assert.ok(markup.indexOf('Nombre denunciante') < markup.indexOf('Resolución registrada'));
  assert.ok(markup.indexOf('Responsable registrado') < markup.indexOf('Nombre responsable'));
  for (const text of ['Referencias del caso', 'Volver a denuncias', 'private-case-id', 'private-owner-id', 'private-decision-id']) assert.ok(!markup.includes(text), text);
  assert.ok(markup.includes('Volver al listado'));
  const original = renderOriginal({ ...detail, entityType: 'ACTIVIDAD', snapshot: { title: 'Actividad original', startAt: '2026-10-20T12:00:00Z', location: { buildingName: 'Edificio original' } } });
  assert.ok(original.includes('Inicio')); assert.ok(original.includes('Edificio original'));
  for (const text of ['Más datos del registro original', 'Contraer registro original', 'denunciante@example.test', 'responsable@example.test']) assert.ok(!original.includes(text), text);
  delete detail.people;
  const missing = renderReview({ selectedId: detail.id, detail });
  assert.ok(missing.includes('Persona no identificada en el registro')); assert.ok(missing.includes('Correo no disponible'));
  assert.ok(!missing.includes('private-decision-id'));
});
