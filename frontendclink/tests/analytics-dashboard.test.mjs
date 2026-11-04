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
function load(path, dependencies) {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, AbortController, URLSearchParams,
    require: name => { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; } });
  return module.exports;
}

// Ejecuta los hooks reales conservando estado y cleanup entre renders.
const options = { institutions: [{ id: 'institution-a', name: 'Institución',
  campuses: [{ id: 'campus-a', name: 'Principal' }, { id: 'campus-b', name: 'Otra' }],
  careers: [{ id: 'career-a', name: 'Informática', campusIds: ['campus-a', 'campus-b'] }] }] };
function harness(historical = false) {
  const calls = [], optionCalls = [], listCalls = [], detailCalls = [], slots = []; let cursor = 0, effects = [], refreshes = 0;
  const auth = { identity: { userId: 'user-a', campusId: 'campus-a', profile: { institucion_id: 'institution-a', estado_cuenta: 'ACTIVA', deleted_at: null },
    roles: [{ name: 'ADMINISTRADOR', campusId: 'campus-a' }], permissions: [], capabilities: { reports: true } }, refreshIdentity() { refreshes++; } };
  const react = {
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useState(initial) {
      const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        effects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: effect() }; });
      }
    },
  };
  const access = load('../src/features/analytics/types/access.ts', {});
  const hooks = load(historical ? '../src/features/analytics/hooks/useHistoricalReports.ts' : '../src/features/analytics/hooks/useAnalyticsDashboard.ts', {
    react, '@/features/auth/hooks/useAuth': { useAuth: () => auth }, '@/lib/api/authenticated-request': { AuthApiError },
    '../types/access': access,
    '../api/dashboardApi': {
      loadDashboardOptions: signal => new Promise((resolve, reject) => optionCalls.push({ signal, resolve, reject })),
      loadDashboard: (from, to, campusId, signal, filters, grouping) => new Promise((resolve, reject) => calls.push({ from, to, campusId, signal, filters, grouping, resolve, reject })),
      generateAnalyticalReport: (from, to, campusId, signal, filters, grouping) => new Promise((resolve, reject) => calls.push({ report: true, from, to, campusId, signal, filters, grouping, resolve, reject })),
      loadHistoricalReports: (filters, cursor, signal) => new Promise((resolve, reject) => listCalls.push({ filters, cursor, signal, resolve, reject })),
      loadHistoricalReport: (id, signal) => new Promise((resolve, reject) => detailCalls.push({ id, signal, resolve, reject })),
    },
  });
  const h = { auth, calls, optionCalls, listCalls, detailCalls, get refreshes() { return refreshes; },
    render() {
      cursor = 0; const result = historical ? hooks.useHistoricalReports() : hooks.useAnalyticsDashboard({ from: '2026-10-01', to: '2026-10-10' });
      const pending = effects; effects = []; pending.forEach(effect => effect()); return result;
    },
    async ready(data = options) { h.render(); optionCalls.at(-1).resolve(data); await setImmediate(); return h.render(); },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); } };
  return h;
}

test('API sends single-campus compatibility and multi-campus/career filters, and retrieves authorized options', async () => {
  const controller = new AbortController(), observed = [];
  const { loadDashboard, loadDashboardOptions } = load('../src/features/analytics/api/dashboardApi.ts', {
    '@/lib/api/authenticated-request': { authenticatedEnvelopeRequest: async (path, init, query) => {
      observed.push({ path, signal: init.signal, query }); return { data: { value: 42 } };
    } },
  });
  await loadDashboard('2026-10-01', '2026-10-10', 'campus-a', controller.signal);
  assert.equal(observed[0].query.toString(), 'from=2026-10-01&to=2026-10-10&campusId=campus-a');
  await loadDashboard('2026-10-01', '2026-10-10', 'campus-a', controller.signal,
    { institutionId: 'institution-a', campusIds: ['campus-a', 'campus-b'], careerId: 'career-a' }, 'week');
  assert.equal(observed[1].query.get('campusIds'), 'campus-a,campus-b'); assert.equal(observed[1].query.get('careerId'), 'career-a');
  assert.equal(observed[1].query.get('institutionId'), 'institution-a'); assert.equal(observed[1].query.has('campusId'), false);
  assert.equal(observed[1].query.get('grouping'), 'week');
  await loadDashboardOptions(controller.signal); assert.equal(observed[2].path, '/api/v1/analytics/options');
  assert.equal(observed[2].signal, controller.signal);
});

test('history transport sends optional scope/period/cursor filters and reads immutable reports by ID using GET', async () => {
  const observed = [], controller = new AbortController();
  const api = load('../src/features/analytics/api/dashboardApi.ts', {
    '@/lib/api/authenticated-request': { authenticatedEnvelopeRequest: async (path, init, query) => {
      observed.push({ path, init, query }); return { data: { items: [], nextCursor: null } };
    } },
  });
  await api.loadHistoricalReports({}, null, controller.signal);
  assert.equal(observed[0].path, '/api/v1/analytics/reports'); assert.equal(observed[0].query.toString(), '');
  await api.loadHistoricalReports({ institutionId: 'institution', campusIds: ['a', 'b'], careerId: 'career',
    from: '2026-09-01', to: '2026-09-30', grouping: 'week' }, 'cursor-value', controller.signal);
  assert.deepEqual(Object.fromEntries(observed[1].query), { institutionId: 'institution', careerId: 'career',
    from: '2026-09-01', to: '2026-09-30', grouping: 'week', campusIds: 'a,b', cursor: 'cursor-value' });
  await api.loadHistoricalReport('report/id', controller.signal);
  assert.equal(observed[2].path, '/api/v1/analytics/reports/report%2Fid');
  assert.ok(observed.every(call => call.init.signal === controller.signal && call.init.method === undefined && call.init.body === undefined));
});

test('history compares fresh saved reports across pages and never calls calculation or generation endpoints', async () => {
  const h = harness(true);
  try {
    assert.equal(h.render().loading, true);
    h.optionCalls[0].reject(new AuthApiError(403)); // Un catálogo retirado no bloquea los reportes históricos.
    h.listCalls[0].resolve({ items: [{ id: 'a' }], nextCursor: 'page2' }); await setImmediate();
    let state = h.render(); assert.equal(state.page.items[0].id, 'a'); assert.equal(state.options, null);
    state.open('a'); assert.equal(h.render().detailLoading, true);
    h.detailCalls[0].resolve({ id: 'a', marker: 'original' }); await setImmediate();
    assert.equal(h.render().reports[0].marker, 'original');
    h.render().nextPage(); assert.equal(h.render().page, null);
    assert.equal(h.listCalls[1].cursor, 'page2'); assert.equal(h.render().reports[0].id, 'a');
    h.listCalls[1].resolve({ items: [{ id: 'b' }], nextCursor: null }); await setImmediate();
    h.render().open('b', true); state = h.render(); assert.equal(state.reports.length, 0); assert.equal(state.detailLoading, true);
    assert.deepEqual(h.detailCalls.slice(1).map(call => call.id), ['a', 'b']);
    h.detailCalls[1].resolve({ id: 'a', marker: 'original' }); h.detailCalls[2].resolve({ id: 'b', marker: 'another snapshot' }); await setImmediate();
    assert.deepEqual(Array.from(h.render().reports, report => report.marker), ['original', 'another snapshot']);
    assert.equal(h.calls.length, 0); assert.equal(h.refreshes, 0);
    h.render().close(); assert.equal(h.render().reports.length, 0);
    h.render().open('a'); h.render(); assert.equal(h.detailCalls.length, 4); // Reabrir exige autorización nueva.
  } finally { h.dispose(); }
});

test('returning to the first historical page preserves A and its snapshot, while filter searches clear selection', async () => {
  const h = harness(true);
  try {
    h.render(); h.listCalls[0].resolve({ items: [{ id: 'b' }], nextCursor: 'page-two' }); await setImmediate();
    h.render().nextPage(); h.render();
    assert.equal(h.listCalls[1].cursor, 'page-two');
    h.listCalls[1].resolve({ items: [{ id: 'a' }], nextCursor: null }); await setImmediate();
    h.render().open('a'); h.render();
    h.detailCalls[0].resolve({ id: 'a', marker: 'original saved A' }); await setImmediate();
    assert.equal(h.render().hasPrevious, true);
    h.render().firstPage();
    const returning = h.render();
    assert.equal(returning.page, null); assert.equal(returning.hasPrevious, false);
    assert.deepEqual([...returning.selectedIds], ['a']); assert.equal(returning.reports[0].marker, 'original saved A');
    assert.equal(h.listCalls[2].cursor, null); assert.equal(h.detailCalls.length, 1);
    h.listCalls[2].resolve({ items: [{ id: 'b' }], nextCursor: 'page-two' }); await setImmediate();
    h.render().open('b', true); h.render();
    assert.deepEqual(h.detailCalls.slice(1).map(call => call.id), ['a', 'b']);
    h.detailCalls[1].resolve({ id: 'a', marker: 'fresh authorized saved A' });
    h.detailCalls[2].resolve({ id: 'b', marker: 'saved B' }); await setImmediate();
    assert.deepEqual(Array.from(h.render().reports, report => report.id), ['a', 'b']);
    assert.equal(h.calls.length, 0); // Navegar y comparar nunca calcula ni genera reportes.
    h.render().search({ grouping: 'week' });
    const filtered = h.render();
    assert.equal(filtered.selectedIds.length, 0); assert.equal(filtered.reports.length, 0);
    assert.equal(h.listCalls[3].cursor, null); assert.equal(h.listCalls[3].filters.grouping, 'week');
    assert.equal(h.detailCalls[2].signal.aborted, true); assert.equal(h.calls.length, 0);
  } finally { h.dispose(); }
});

test('history revisits opaque cursors, retires changed boundaries and refreshes filters without replacing selected A', async () => {
  const h = harness(true);
  try {
    h.render(); h.render().search({ from: '2026-09-01', campusIds: ['campus-a'] }); h.render();
    h.listCalls.at(-1).resolve({ items: [{ id: 'a' }], nextCursor: 'opaque-two' }); await setImmediate();
    h.render().open('a'); h.render(); h.detailCalls[0].resolve({ id: 'a', marker: 'original' }); await setImmediate();
    h.render().goToPage(2); h.render(); assert.equal(h.listCalls.at(-1).cursor, 'opaque-two');
    h.listCalls.at(-1).resolve({ items: [{ id: 'b' }], nextCursor: 'opaque-three' }); await setImmediate();
    h.render().goToPage(3); h.render(); assert.equal(h.listCalls.at(-1).cursor, 'opaque-three');
    h.listCalls.at(-1).reject(new Error('offline')); await setImmediate();
    assert.equal(h.render().pageNumber, 3); assert.equal(h.render().visitedPages, 3); assert.ok(h.render().error);
    h.render().goToPage(1); h.render(); assert.equal(h.listCalls.at(-1).cursor, null);
    h.listCalls.at(-1).resolve({ items: [{ id: 'new' }], nextCursor: 'changed-two' }); await setImmediate();
    h.render().goToPage(2); h.render(); assert.equal(h.listCalls.at(-1).cursor, 'changed-two');
    assert.equal(h.render().visitedPages, 2); // El tercer límite pertenecía a la serie anterior.
    h.listCalls.at(-1).resolve({ items: [{ id: 'last' }], nextCursor: null }); await setImmediate();
    const count = h.listCalls.length;
    for (const value of [0, -1, 1.5, 99, 2]) h.render().goToPage(value);
    h.render(); assert.equal(h.listCalls.length, count);
    h.render().refresh(); const refreshing = h.render();
    assert.equal(refreshing.pageNumber, 1); assert.equal(refreshing.visitedPages, 1); assert.equal(refreshing.page, null);
    assert.equal(h.listCalls.at(-1).cursor, null); assert.equal(h.listCalls.at(-1).filters.from, '2026-09-01');
    assert.deepEqual([...h.listCalls.at(-1).filters.campusIds], ['campus-a']);
    assert.deepEqual([...refreshing.selectedIds], ['a']); assert.equal(refreshing.reports[0].marker, 'original');
    assert.equal(h.detailCalls.length, 1); assert.equal(h.calls.length, 0);
    h.render().search({ grouping: 'month' }); h.render();
    const abortedRefresh = h.listCalls.at(-2); assert.ok(abortedRefresh.signal.aborted);
    abortedRefresh.resolve({ items: [{ id: 'late' }], nextCursor: 'wrong' }); await setImmediate();
    assert.equal(h.render().page, null); assert.equal(h.render().visitedPages, 1); assert.equal(h.render().selectedIds.length, 0);
  } finally { h.dispose(); }
});

test('historical filter changes, rapid opens and identity changes discard late lists and snapshots', async () => {
  const h = harness(true);
  try {
    h.render(); h.render().search({ from: '2026-09-01', campusIds: ['campus-b'] }); h.render();
    assert.equal(h.listCalls[0].signal.aborted, true);
    h.listCalls[0].resolve({ items: [{ id: 'stale' }], nextCursor: null }); await setImmediate(); assert.equal(h.render().page, null);
    h.listCalls[1].resolve({ items: [{ id: 'a' }, { id: 'b' }], nextCursor: null }); await setImmediate();
    h.render().open('a'); h.render(); h.render().open('b'); h.render();
    assert.equal(h.detailCalls[0].signal.aborted, true);
    h.detailCalls[0].resolve({ id: 'a' }); await setImmediate(); assert.equal(h.render().reports.length, 0);
    h.detailCalls[1].resolve({ id: 'b' }); await setImmediate(); assert.equal(h.render().reports[0].id, 'b');
    h.auth.identity.userId = 'user-b'; assert.equal(h.render().page, null); assert.equal(h.render().reports.length, 0);
    assert.equal(h.listCalls[1].signal.aborted, true); assert.equal(h.detailCalls[1].signal.aborted, true);
    h.auth.identity.roles = []; assert.equal(h.render().allowed, false); assert.equal(h.render().loading, false);
    const count = h.listCalls.length; h.auth.identity = null; h.render(); assert.equal(h.listCalls.length, count);
    h.dispose(); h.listCalls.at(-1).resolve({ items: [{ id: 'late' }], nextCursor: null }); await setImmediate(); assert.equal(h.render().page, null);
  } finally { h.dispose(); }
});

test('historical comparison fails as a whole after revocation, refreshes identity and retries both authorized reads', async () => {
  const h = harness(true);
  try {
    h.render(); h.listCalls[0].resolve({ items: [{ id: 'a' }, { id: 'b' }], nextCursor: null }); await setImmediate();
    h.render().open('a'); h.render(); h.detailCalls[0].resolve({ id: 'a' }); await setImmediate();
    h.render().open('b', true); h.render();
    h.detailCalls[1].resolve({ id: 'a' }); h.detailCalls[2].reject(new AuthApiError(403, 'Permiso revocado.')); await setImmediate();
    assert.equal(h.render().reports.length, 0); assert.equal(h.render().detailError, 'Permiso revocado.'); assert.equal(h.refreshes, 1);
    h.render().retryDetail(); h.render();
    assert.deepEqual(h.detailCalls.slice(3).map(call => call.id), ['a', 'b']);
    h.detailCalls[3].resolve({ id: 'a' }); h.detailCalls[4].resolve({ id: 'b' }); await setImmediate(); assert.equal(h.render().reports.length, 2);
    h.render().search({ grouping: 'week' }); h.render(); assert.equal(h.render().reports.length, 0);
    h.listCalls[1].reject(new AuthApiError(503, 'Historial no disponible.')); await setImmediate();
    assert.equal(h.render().error, 'Historial no disponible.'); assert.equal(h.render().loading, false);
    h.render().search(); h.render(); h.listCalls[2].resolve({ items: [], nextCursor: null }); await setImmediate();
    assert.equal(h.render().page.items.length, 0);
  } finally { h.dispose(); }
});

test('revocation detected on the next historical page also retires an already open snapshot', async () => {
  const h = harness(true);
  try {
    h.render(); h.listCalls[0].resolve({ items: [{ id: 'a' }], nextCursor: 'next' }); await setImmediate();
    h.render().open('a'); h.render(); h.detailCalls[0].resolve({ id: 'a' }); await setImmediate();
    assert.equal(h.render().reports.length, 1);
    h.render().nextPage(); h.render(); h.listCalls[1].reject(new AuthApiError(403, 'Acceso revocado.')); await setImmediate();
    assert.equal(h.render().reports.length, 0); assert.equal(h.render().selectedIds.length, 0);
    assert.equal(h.refreshes, 1); assert.equal(h.render().error, 'Acceso revocado.');
  } finally { h.dispose(); }
});

test('changing campus or career hides prior KPI and aborts/discards stale responses; empty campus selection never queries', async () => {
  const h = harness();
  try {
    assert.equal(h.render().loading, true); assert.equal(h.calls.length, 0);
    await h.ready(); h.calls[0].resolve({ marker: 'initial' }); await setImmediate(); assert.equal(h.render().dashboard.marker, 'initial');
    h.render().selectFilters({ institutionId: 'institution-a', campusIds: ['campus-a', 'campus-b'], careerId: 'career-a' });
    assert.equal(h.render().dashboard, null); assert.equal(h.calls[0].signal.aborted, true);
    assert.deepEqual([...h.calls[1].filters.campusIds], ['campus-a', 'campus-b']); assert.equal(h.calls[1].filters.careerId, 'career-a');
    h.render().selectFilters({ institutionId: 'institution-a', campusIds: ['campus-b'] }); h.render();
    h.calls[1].resolve({ marker: 'late' }); await setImmediate(); assert.equal(h.render().dashboard, null);
    h.calls[2].resolve({ marker: 'current' }); await setImmediate(); assert.equal(h.render().dashboard.marker, 'current');
    h.render().selectFilters({ institutionId: 'institution-a', campusIds: [] }); assert.equal(h.render().dashboard, null);
    assert.equal(h.render().loading, false); assert.equal(h.calls.length, 3);
  } finally { h.dispose(); }
});

test('identity, campus and grant changes retire metrics and options; late results and unmounted responses are discarded', async () => {
  const h = harness();
  try {
    await h.ready(); h.calls[0].resolve({ marker: 'initial' }); await setImmediate(); assert.ok(h.render().dashboard);
    h.auth.identity.campusId = 'campus-b'; assert.equal(h.render().dashboard, null); assert.equal(h.render().options, null);
    await h.ready(); assert.equal(h.calls[1].filters.campusIds[0], 'campus-b');
    h.auth.identity.userId = 'user-b'; h.render(); assert.equal(h.calls[1].signal.aborted, true);
    h.calls[1].resolve({ marker: 'old-user' }); await setImmediate(); assert.equal(h.render().dashboard, null);
    await h.ready(); h.auth.identity.roles = []; assert.equal(h.render().dashboard, null); assert.equal(h.render().options, null);
    assert.equal(h.render().loading, false); assert.equal(h.calls[2].signal.aborted, true);
    h.auth.identity = null; h.render(); h.dispose();
    h.calls[2].resolve({ marker: 'after-unmount' }); await setImmediate(); assert.equal(h.render().dashboard, null);
  } finally { h.dispose(); }
});

test('new ranges and retries reload authorized options; 401/403 refresh identity and dependency errors stay visible', async () => {
  const h = harness();
  try {
    await h.ready(); h.calls[0].resolve({ marker: 'initial' }); await setImmediate();
    h.render().consult('2026-09-01', '2026-09-30'); assert.equal(h.render().dashboard, null);
    await h.ready(); assert.equal(h.calls[1].from, '2026-09-01'); assert.equal(h.calls[1].to, '2026-09-30');
    h.calls[1].reject(new AuthApiError(503, 'Vuelve a intentarlo.')); await setImmediate();
    assert.equal(h.render().error, 'Vuelve a intentarlo.'); assert.equal(h.refreshes, 0);
    for (const status of [401, 403]) {
      h.render().consult('2026-09-01', '2026-09-30'); await h.ready();
      h.calls.at(-1).reject(new AuthApiError(status)); await setImmediate(); assert.equal(h.render().dashboard, null);
    }
    assert.equal(h.refreshes, 2);
    h.render().consult('2026-09-01', '2026-09-30'); h.render();
    h.optionCalls.at(-1).reject(new AuthApiError(503, 'Filtros no disponibles.')); await setImmediate();
    assert.equal(h.render().error, 'Filtros no disponibles.'); assert.equal(h.render().options, null);
    assert.equal(h.render().loading, false);
  } finally { h.dispose(); }
});

test('late option catalogs never replace a new identity and returning to the previous identity requires fresh metrics', async () => {
  const h = harness();
  try {
    await h.ready(); h.calls[0].resolve({ marker: 'initial-a' }); await setImmediate(); assert.ok(h.render().dashboard);
    h.auth.identity.userId = 'user-b'; h.render();
    h.auth.identity.userId = 'user-a'; h.render();
    h.optionCalls[1].resolve({ institutions: [{ ...options.institutions[0], name: 'Catálogo tardío B' }] });
    await setImmediate(); assert.equal(h.render().options, null);
    h.optionCalls[2].resolve(options); await setImmediate();
    assert.equal(h.render().dashboard, null); assert.equal(h.calls.length, 2);
    h.calls[1].resolve({ marker: 'fresh-a' }); await setImmediate(); assert.equal(h.render().dashboard.marker, 'fresh-a');
  } finally { h.dispose(); }
});

test('revoked then restored identical grants cannot revive cached options or metrics', async () => {
  const h = harness();
  try {
    await h.ready(); h.calls[0].resolve({ marker: 'before-revoke' }); await setImmediate(); assert.ok(h.render().dashboard);
    const roles = h.auth.identity.roles;
    h.auth.identity.roles = []; h.render();
    h.auth.identity.roles = roles;
    const restored = h.render(); assert.equal(restored.options, null); assert.equal(restored.dashboard, null);
    await h.ready(); assert.equal(h.render().dashboard, null); assert.equal(h.calls.length, 2);
  } finally { h.dispose(); }
});

test('visual access considers reporting grants in other campuses, with role and permission separately', () => {
  const { canAccessAnalytics } = load('../src/features/analytics/types/access.ts', {});
  const identity = { roles: [{ name: 'USUARIO_AUTORIZADO', campusId: 'other' }], permissions: [], profile: { estado_cuenta: 'ACTIVA' } };
  assert.equal(canAccessAnalytics(identity), false);
  identity.permissions.push({ name: 'ACCEDER_ANALITICA', campusId: 'other' }); assert.equal(canAccessAnalytics(identity), false);
  identity.permissions.push({ name: 'ACCEDER_REPORTERIA', campusId: 'other' }); assert.equal(canAccessAnalytics(identity), true);
  identity.roles = []; assert.equal(canAccessAnalytics(identity), false);
});

function renderDashboard(state, actions = [], overrides = {}) {
  const renderer = analyticsRenderer({
    '@/features/analytics/hooks/useAnalyticsDashboard': { useAnalyticsDashboard: () => ({
      consult() {}, generateReport() {}, applyQuery() {}, allowed: true, identityKey: 'session',
      range: { from: '2026-10-01', to: '2026-10-10', grouping: 'month' }, options,
      filters: { institutionId: 'institution-a', campusIds: ['campus-a'] }, ...state,
    }) },
    ...overrides,
  }, actions);
  return renderer.render('app/(analytics)/analytics.tsx');
}

// Cambia únicamente el almacenamiento de useState; JSX y componentes siguen siendo reales.
// Permite abrir divulgaciones progresivas sin fingir sus resultados en el render SSR.
function statefulPresentation(file, exportName, props, overrides = {}) {
  const slots = [], actions = []; let cursor = 0;
  const renderer = analyticsRenderer({ react: { ...React, useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  } }, ...overrides }, actions);
  return { actions, render() { cursor = 0; actions.length = 0; return renderer.render(file, exportName, props); } };
}

test('analytics navigation satisfies native Slot style constraints with either tab active', () => {
  for (const history of [false, true]) {
    const actions = [];
    const html = analyticsRenderer({}, actions).render('src/features/analytics/components/AnalyticsUI.tsx', 'AnalyticsPage', { history, children: null });
    assert.ok(html.includes('Resumen')); assert.ok(html.includes('Reportes guardados'));
    const links = actions.filter(row => row.href);
    assert.equal(links.length, 3);
    assert.ok(links.every(row => !Array.isArray(row.style)));
    const selected = links.find(row => row.accessibilityState?.selected);
    assert.equal(selected.href, history ? '/(analytics)/history' : '/(analytics)/analytics');
    assert.equal(selected.style.borderBottomColor, '#002E56');
  }
});

test('real dashboard renders four KPI with scope and period, separate demand counts and participation meaning', () => {
  const scope = { institutionName: 'Institución de prueba', campusName: 'Sede de prueba' };
  const period = { from: '2026-10-01', to: '2026-10-10', timeZone: 'UTC' };
  const metric = value => ({ value, scope, period });
  const html = renderDashboard({ loading: false, error: '', dashboard: { scope, period,
    activeUsers: metric(10), resourceDemand: { ...metric(5), views: 3, requests: 2 },
    subjectDemand: { ...metric(5), views: 3, requests: 2, subjects: [{ subjectId: 'subject-a', subjectName: 'Álgebra', views: 3, requests: 2 }] },
    activityParticipation: { ...metric(7), legacyEvents: 1 }, notes: ['Cobertura parcial de prueba.'],
  } });
  for (const title of ['Cuentas activas', 'Recursos vistos y pedidos', 'Interés por asignaturas', 'Inscripciones a actividades']) assert.ok(html.includes(title), title);
  assert.ok(html.split('2026').length - 1 >= 8);
  assert.ok(html.includes('Institución de prueba'));
  assert.ok(html.includes('vistas')); assert.ok(html.includes('solicitudes')); assert.ok(html.includes('Álgebra'));
  assert.ok(html.includes('Expandir tarjeta Inscripciones a actividades'));
  assert.ok(!html.includes('El historial puede estar incompleto')); assert.ok(html.includes('Interés por asignatura'));
});

test('real dashboard error/loading states keep filters and retry available without rendering misleading KPI', () => {
  const failed = renderDashboard({ dashboard: null, error: 'No se pudo consultar el tablero.', loading: false });
  assert.ok(failed.includes('Reintentar consulta')); assert.ok(failed.includes('role="alert"'));
  assert.ok(!failed.includes('Cuentas activas'));
  const loading = renderDashboard({ dashboard: null, error: '', loading: true });
  assert.ok(loading.includes('Cargando indicadores')); assert.ok(loading.includes('Abrir filtros de analítica')); assert.ok(!loading.includes('Fecha inicial'));
  assert.ok(!loading.includes('Inscripciones a actividades'));
});

test('disabled actions explain why, and uncertain report generation directs to history without automatic retry', () => {
  const actions = [], html = renderDashboard({ dashboard: null, error: '', loading: true, options: null }, actions);
  const save = actions.find(row => row.accessibilityLabel === 'Guardar reporte');
  assert.equal(save.disabled, true); assert.equal(save.accessibilityHint, 'Espera a que termine la consulta.');
  assert.ok(html.includes('Espera a que termine la consulta.'));
  assert.ok(html.includes('Cargando filtros…'));
  const uncertainActions = [], uncertain = renderDashboard({ dashboard: null, error: 'Network timeout', loading: false, reportRequested: true }, uncertainActions);
  assert.ok(uncertain.includes('No pudimos confirmar si se guardó; revisa Reportes guardados antes de intentar otra vez.'));
  assert.ok(uncertain.includes('Revisar Reportes guardados'));
  assert.ok(!uncertain.includes('Network timeout'));
  assert.ok(!uncertainActions.some(row => row.accessibilityLabel === 'Reintentar consulta'));
  assert.equal(uncertainActions.find(row => row.accessibilityLabel === 'Guardar reporte').disabled, true);
});

test('save report appears once after subject demand, stays explicit and is absent without reporting access', () => {
  const actions = [], generated = [];
  const html = renderDashboard({ dashboard: chartFixture([3]), loading: false, error: '', generateReport(...args) { generated.push(args); } }, actions);
  assert.equal(actions.filter(row => row.accessibilityLabel === 'Guardar reporte').length, 1);
  assert.ok(html.indexOf('aria-label="Guardar reporte"') > html.lastIndexOf('Interés por asignatura'), 'saving follows the complete results');
  assert.ok(!html.includes('Guardar recalcula las cifras y crea un nuevo reporte.'));
  assert.equal(generated.length, 0, 'mounting does not generate a report');
  actions.find(row => row.accessibilityLabel === 'Guardar reporte').onPress();
  assert.deepEqual(generated, [['2026-10-01', '2026-10-10', 'month']]);
  const denied = [];
  renderDashboard({ allowed: false, dashboard: null, options: null, loading: false, error: '' }, denied);
  assert.ok(!denied.some(row => row.accessibilityLabel === 'Guardar reporte'));
});

test('summary context bar starts collapsed, expands applied filters and keeps the filters button above in either state', () => {
  let filterPanel;
  const queries = [], state = { allowed: true, identityKey: 'session', loading: false, error: '', options,
    filters: { institutionId: 'institution-a', campusIds: ['campus-a'], careerId: 'career-a' },
    range: { from: '2026-10-01', to: '2026-10-28', grouping: 'month' },
    applyQuery(filters, from, to, grouping) { queries.push({ filters, from, to, grouping }); state.filters = filters; state.range = { from, to, grouping }; },
    consult() {}, generateReport() { throw Error('no implicit generation'); },
  };
  const h = statefulPresentation('app/(analytics)/analytics.tsx', 'default', {}, {
    '@/features/analytics/hooks/useAnalyticsDashboard': { useAnalyticsDashboard: () => state },
    '@/features/analytics/components/AnalyticsFilters': { AnalyticsFilters: props => { filterPanel = props; return null; } },
  });
  let html = h.render(); assert.ok(!html.includes('Agrupación')); assert.ok(!html.includes('Informática'));
  assert.ok(html.indexOf('aria-label="Abrir filtros de analítica') < html.indexOf('aria-label="Expandir filtros aplicados'));
  assert.ok(html.includes('1–28 oct')); assert.ok(html.includes('Principal'));
  h.actions.find(row => row.accessibilityLabel === 'Expandir filtros aplicados').onPress();
  html = h.render();
  for (const text of ['Sede', 'Principal', 'Carreras', 'Informática', 'Período', 'Agrupación', 'Por mes']) assert.ok(html.includes(text), text);
  assert.ok(html.indexOf('aria-label="Abrir filtros de analítica') < html.indexOf('aria-label="Contraer filtros aplicados'));
  assert.equal(h.actions.find(row => row.accessibilityLabel === 'Contraer filtros aplicados')['aria-expanded'], true);
  h.actions.find(row => row.accessibilityLabel?.startsWith('Abrir filtros de analítica')).onPress(); h.render();
  assert.equal(queries.length, 0);
  filterPanel.onApply({ institutionId: 'institution-a', campusIds: ['campus-b'], from: '2026-09-01', to: '2026-09-30', grouping: 'week' });
  html = h.render(); assert.ok(html.includes('Otra')); assert.ok(html.includes('Por semana')); assert.ok(!html.includes('Informática'));
  assert.ok(!html.includes('Filtros aplicados.'));
  assert.equal(queries.length, 1);
  h.actions.find(row => row.accessibilityLabel === 'Contraer filtros aplicados').onPress(); html = h.render();
  assert.ok(!html.includes('Agrupación')); assert.ok(h.actions.some(row => row.accessibilityLabel?.startsWith('Abrir filtros de analítica')));
  h.actions.find(row => row.accessibilityLabel === 'Expandir filtros aplicados').onPress(); h.render();
  assert.ok(h.actions.some(row => row.accessibilityLabel === 'Contraer filtros aplicados'));
  state.identityKey = 'other-session'; html = h.render(); assert.ok(h.actions.some(row => row.accessibilityLabel === 'Expandir filtros aplicados'));
});

test('summary uses shared pull refresh for the applied query without a manual refresh button or report generation', () => {
  let refresh;
  const queried = [], generated = [], actions = [];
  const overrides = {
    '@/components/RefreshScrollView': { RefreshScrollView: props => { refresh = props; return props.children; } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }) },
  };
  const state = { loading: false, error: '', dashboard: chartFixture([3]),
    range: { from: '2026-08-03', to: '2026-09-27', grouping: 'week' },
    consult(...args) { queried.push(args); }, generateReport(...args) { generated.push(args); } };
  renderDashboard(state, actions, overrides);
  assert.equal(refresh.refreshEnabled, true);
  assert.equal(refresh.refreshing, false);
  assert.equal(refresh.refreshIndicatorOffset, 67);
  assert.equal(refresh.refreshLabel, 'la consulta de analítica');
  assert.ok(!actions.some(row => row.accessibilityLabel === 'Actualizar'));
  assert.equal(queried.length, 0);
  refresh.onRefresh();
  assert.deepEqual(queried, [['2026-08-03', '2026-09-27', 'week']]);
  assert.equal(generated.length, 0);
  for (const blocked of [{ loading: true }, { allowed: false }, { reportRequested: true },
    { report: { ...chartFixture([3]), id: 'saved', generatedBy: { name: 'Ana' }, calculationVersion: 'v1' } }]) {
    renderDashboard({ ...state, ...blocked }, [], overrides);
    assert.equal(refresh.refreshEnabled, false);
    assert.equal(refresh.refreshing, !!blocked.loading);
  }
  renderDashboard({ ...state, error: 'Error de consulta', dashboard: null }, [], overrides);
  assert.equal(refresh.refreshEnabled, true, 'query failures can be retried with the gesture');
});

test('opening filters blocks pull refresh until the draft is closed', () => {
  let refresh, close;
  const page = statefulPresentation('app/(analytics)/analytics.tsx', 'default', {}, {
    '@/components/RefreshScrollView': { RefreshScrollView: props => { refresh = props; return props.children; } },
    '@/features/analytics/hooks/useAnalyticsDashboard': { useAnalyticsDashboard: () => ({
      allowed: true, loading: false, error: '', identityKey: 'session', options,
      filters: { institutionId: 'institution-a', campusIds: ['campus-a'] },
      range: { from: '2026-10-01', to: '2026-10-10', grouping: 'month' }, consult() {},
    }) },
    '@/features/analytics/components/AnalyticsFilters': { AnalyticsFilters: ({ onClose }) => { close = onClose; return null; } },
  });
  page.render(); assert.equal(refresh.refreshEnabled, true);
  page.actions.find(row => row.accessibilityLabel?.startsWith('Abrir filtros de analítica')).onPress();
  page.render(); assert.equal(refresh.refreshEnabled, false);
  close(); page.render(); assert.equal(refresh.refreshEnabled, true);
});

test('KPI disclosures retain definitions and imported history without repeating cutoff, context or timezone', () => {
  const scope = { institutionName: 'Institución original', campusName: 'Campus original', career: { id: 'career', name: 'Carrera original' } };
  const period = { from: '2026-09-01', to: '2026-09-30', cutoff: '2026-10-01T03:00:00Z', timeZone: 'America/Santiago' };
  const metric = { value: 7, scope, period };
  const metrics = { scope, period, activeUsers: metric, resourceDemand: { ...metric, views: 5, requests: 2 },
    subjectDemand: { ...metric, views: 5, requests: 2, subjects: [] }, activityParticipation: { ...metric, legacyEvents: 1 } };
  const expectations = [
    ['activeUsers', 'Cuentas activas', 'no son personas conectadas ni inicios de sesión'],
    ['resourceDemand', 'Recursos vistos y pedidos', 'no son recursos únicos'],
    ['subjectDemand', 'Interés por asignaturas', 'los resultados por asignatura no son conjuntos exclusivos'],
    ['activityParticipation', 'Inscripciones a actividades', 'no es asistencia presencial ni participantes actuales', 'historial importado parcialmente'],
  ];
  for (const [kind, title, definition, detail] of expectations) {
    const h = statefulPresentation('src/features/analytics/components/AnalyticsResults.tsx', 'KpiCard', { kind, metrics });
    const initial = h.render(); assert.ok(!initial.includes(definition));
    for (const text of [title, '2026']) assert.ok(initial.includes(text), `${kind}: ${text}`);
    for (const text of ['Institución original', 'Campus original', 'Carrera original']) assert.ok(!initial.includes(text), `${kind}: collapsed ${text}`);
    const trigger = h.actions.find(row => row.accessibilityLabel === `Expandir tarjeta ${title}`);
    assert.equal(trigger.accessibilityState.expanded, false); trigger.onPress();
    const expanded = h.render(); assert.ok(expanded.includes(definition), kind);
    for (const text of ['Institución original', 'Campus original', 'Carrera original', 'Cierre del período:', 'America/Santiago']) assert.ok(!expanded.includes(text), `${kind}: removed ${text}`);
    if (detail) assert.ok(expanded.includes(detail), detail);
    const collapse = h.actions.find(row => row.accessibilityLabel === `Contraer tarjeta ${title}`);
    assert.equal(collapse.accessibilityState.expanded, true); collapse.onPress();
    assert.ok(!h.render().includes('Institución original'));
    assert.equal(h.actions.find(row => row.accessibilityLabel === `Expandir tarjeta ${title}`).accessibilityState.expanded, false);
  }
});

test('compact saved report expands original human context without technical details', () => {
  const report = { id: 'immutable-report-id', scope: { institutionId: 'original-institution-id', institutionName: 'Institución original', campusName: 'Campus original',
    campuses: [{ id: 'original-campus-id', name: 'Campus original' }], career: { id: 'original-career-id', name: 'Carrera original' } },
    period: { from: '2026-09-01', to: '2026-09-30', cutoff: '2026-10-01T03:00:00Z', timeZone: 'America/Santiago' },
    grouping: 'week', generatedAt: '2026-10-22T16:35:42Z', generatedBy: { userId: 'original-user-id', name: 'Responsable original' }, calculationVersion: 'campuslink-kpi-v1' };
  const h = statefulPresentation('src/features/analytics/components/AnalyticsResults.tsx', 'ReportSummary', { report, compact: true, exportActions: false });
  let html = h.render(); assert.ok(html.includes('Campus original')); assert.ok(html.includes('2026'));
  assert.ok(!html.includes('immutable-report-id')); assert.ok(!html.includes('Responsable original')); assert.ok(!html.includes('Descargar'));
  h.actions.find(row => row.accessibilityLabel?.startsWith('Ver contexto completo del reporte')).onPress();
  html = h.render();
  for (const text of ['Institución original', 'Carrera original', 'Responsable original', 'Semanal · lunes a domingo', 'America/Santiago', '13:35:42']) assert.ok(html.includes(text), text);
  for (const text of ['Detalles técnicos', 'immutable-report-id', 'original-institution-id', 'original-campus-id', 'original-career-id', 'original-user-id', '2026-10-01T03:00:00Z', 'campuslink-kpi-v1']) assert.ok(!html.includes(text), text);
});

test('results omit the removed coverage notice without changing original notes', () => {
  const scope = { institutionName: 'Institución', campusName: 'Campus' };
  const period = { from: '2026-09-01', to: '2026-09-30', timeZone: 'America/Santiago' }, metric = { value: 0, scope, period };
  const dashboard = { scope, period, activeUsers: metric, resourceDemand: { ...metric, views: 0, requests: 0 },
    subjectDemand: { ...metric, views: 0, requests: 0, subjects: [] }, activityParticipation: { ...metric, legacyEvents: 0 },
    intervals: [], notes: ['Nota original conservada por el servidor.'] };
  const h = statefulPresentation('src/features/analytics/components/AnalyticsResults.tsx', 'AnalyticsResults', { dashboard });
  const html = h.render();
  assert.ok(!html.includes('El historial puede estar incompleto'));
  assert.ok(!h.actions.some(row => row.accessibilityLabel === 'Más información sobre el historial disponible'));
  assert.deepEqual(dashboard.notes, ['Nota original conservada por el servidor.']);
});

test('filters show authorized multi-campus choices, submit a copy atomically and block empty campus selection', () => {
  const value = { institutionId: 'institution-a', campusIds: ['campus-a'], careerId: 'career-a', from: '2026-10-01', to: '2026-10-10', grouping: 'week' };
  const calls = [];
  const panel = statefulPresentation('src/features/analytics/components/AnalyticsFilters.tsx', 'AnalyticsFilters', { value, options, onApply: next => calls.push(next), onClose: () => calls.push('closed') });
  const actions = panel.actions;
  let html = panel.render();
  assert.equal(actions.filter(row => row.accessibilityRole === 'checkbox').length, 0);
  actions.find(row => row.accessibilityLabel === 'Seleccionar campus').onPress();
  html = panel.render();
  for (const text of ['Principal', 'Otra', 'Informática', 'Desde', 'Hasta']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('Ajena'));
  assert.equal(actions.filter(row => row.accessibilityRole === 'checkbox').length, 2);
  actions.find(row => row.accessibilityLabel === 'Guardar filtros').onPress();
  assert.equal(calls[0].grouping, 'week'); assert.deepEqual([...calls[0].campusIds], ['campus-a']);
  assert.notEqual(calls[0].campusIds, value.campusIds);
  actions.find(row => row.accessibilityLabel === 'Cerrar filtros').onPress(); assert.equal(calls[1], 'closed');
  const emptyActions = []; const empty = analyticsRenderer({}, emptyActions).render('src/features/analytics/components/AnalyticsFilters.tsx', 'AnalyticsFilters', { value: { ...value, campusIds: [] }, options, onApply() { throw Error('invalid submission'); }, onClose() {} });
  assert.ok(empty.includes('Selecciona al menos un campus.'));
  const submit = emptyActions.find(row => row.accessibilityLabel === 'Guardar filtros'); assert.equal(submit.disabled, true); submit.onPress();
});

test('campus dropdown edits a draft and clears a career that becomes incompatible before atomic apply', () => {
  const value = { institutionId: 'institution-a', campusIds: ['campus-a'], careerId: 'career-a', from: '2026-09-01', to: '2026-09-30', grouping: 'month' };
  const localOptions = { institutions: [{ ...options.institutions[0], careers: [{ id: 'career-a', name: 'Carrera de Principal', campusIds: ['campus-a'] }] }] };
  const calls = [];
  const panel = statefulPresentation('src/features/analytics/components/AnalyticsFilters.tsx', 'AnalyticsFilters', { value, options: localOptions, onApply: (...args) => calls.push(args), onClose() {} });
  panel.render(); panel.actions.find(row => row.accessibilityLabel === 'Seleccionar campus').onPress(); panel.render();
  panel.actions.find(row => row.accessibilityLabel === 'Otra').onPress(); panel.render();
  panel.actions.find(row => row.accessibilityLabel === 'Principal').onPress();
  const html = panel.render(); assert.ok(html.includes('Se quitó la carrera')); assert.equal(calls.length, 0);
  assert.equal(value.careerId, 'career-a'); assert.deepEqual(value.campusIds, ['campus-a']);
  panel.actions.find(row => row.accessibilityLabel === 'Semana (lunes a domingo)').onPress(); panel.render();
  assert.equal(panel.actions.find(row => row.accessibilityLabel === 'Semana (lunes a domingo)').accessibilityState.checked, true);
  panel.actions.find(row => row.accessibilityLabel === 'Guardar filtros').onPress();
  assert.deepEqual([...calls[0][0].campusIds], ['campus-b']); assert.equal(calls[0][0].careerId, undefined);
  assert.equal(calls[0][0].from, '2026-09-01'); assert.equal(calls[0][0].grouping, 'week');
  assert.equal(calls[0][1].careerCleared, true);
});

test('clear only resets the filter draft, with valid dashboard defaults and optional history filters', () => {
  const value = { institutionId: 'institution-a', campusIds: ['campus-b'], careerId: 'career-a', from: '2026-01-05', to: '2026-01-11', grouping: 'week' };
  for (const historical of [false, true]) {
    const calls = [];
    const panel = statefulPresentation('src/features/analytics/components/AnalyticsFilters.tsx', 'AnalyticsFilters', { value, options, historical, onApply: next => calls.push(next), onClose() {} });
    panel.render(); panel.actions.find(row => row.accessibilityLabel === 'Limpiar filtros').onPress(); panel.render();
    assert.equal(calls.length, 0); assert.equal(value.careerId, 'career-a');
    assert.equal(panel.actions.find(row => row.accessibilityLabel === 'Guardar filtros').disabled, false);
    panel.actions.find(row => row.accessibilityLabel === 'Guardar filtros').onPress();
    assert.equal(calls[0].careerId, undefined);
    if (historical) { assert.equal(calls[0].campusIds.length, 0); assert.equal(calls[0].from, undefined); assert.equal(calls[0].grouping, undefined); }
    else { assert.deepEqual([...calls[0].campusIds], ['campus-a']); assert.match(calls[0].from, /^\d{4}-\d{2}-01$/); assert.equal(calls[0].grouping, 'month'); }
  }
});

test('each collapsed card keeps scope in its accessible hint and the dashboard retains the applied context', () => {
  const scope = { institutionName: 'Institución', campusName: 'Principal, Otra', career: { id: 'career-a', name: 'Informática' } };
  const period = { from: '2026-10-01', to: '2026-10-10' }, metric = { value: 0, scope, period };
  const html = renderDashboard({ loading: false, error: '', dashboard: { scope, period,
    activeUsers: metric, resourceDemand: { ...metric, views: 0, requests: 0 },
    subjectDemand: { ...metric, views: 0, requests: 0, subjects: [] }, activityParticipation: { ...metric, legacyEvents: 0 }, notes: [] } });
  const renderer = analyticsRenderer();
  const { KPI_KINDS } = renderer.load('src/features/analytics/components/AnalyticsResults.tsx');
  for (const kind of KPI_KINDS) {
    const actions = [];
    const card = analyticsRenderer({}, actions).render('src/features/analytics/components/AnalyticsResults.tsx', 'KpiCard', { kind, metrics: {
      activeUsers: metric, resourceDemand: { ...metric, views: 0, requests: 0 }, subjectDemand: { ...metric, views: 0, requests: 0, subjects: [] },
      activityParticipation: { ...metric, legacyEvents: 0 },
    } });
    const expand = actions.find(row => row.accessibilityLabel?.startsWith('Expandir tarjeta'));
    for (const text of ['Institución', 'Principal, Otra', 'Informática']) {
      assert.ok(!card.includes(text), `${kind}: hidden scope ${text}`);
      assert.ok(expand.accessibilityHint.includes(text), `${kind}: accessible scope ${text}`);
    }
    assert.ok(card.includes('2026'));
  }
  assert.ok(html.includes('Principal, Otra'));
});

test('changing grouping with the same dates retires monthly data and ignores its late response', async () => {
  const h = harness();
  try {
    await h.ready(); assert.equal(h.calls[0].grouping, 'month');
    h.render().consult('2026-10-01', '2026-10-10', 'week');
    assert.equal(h.render().dashboard, null); assert.equal(h.calls[0].signal.aborted, true);
    await h.ready(); assert.equal(h.calls[1].grouping, 'week');
    h.calls[0].resolve({ marker: 'late-month' }); await setImmediate(); assert.equal(h.render().dashboard, null);
    h.calls[1].resolve({ marker: 'week' }); await setImmediate(); assert.equal(h.render().dashboard.marker, 'week');
    h.render().consult('2026-09-01', '2026-09-30'); await h.ready();
    assert.equal(h.calls[2].grouping, 'week'); // Un reintento sin agrupación explícita conserva la confirmada.
  } finally { h.dispose(); }
});

test('weekly evolution renders observed zeroes, unavailable intervals, subject demand and institutional timezone', () => {
  const scope = { institutionName: 'Institución', campusName: 'Principal' };
  const period = { from: '2026-09-06', to: '2026-09-06', timeZone: 'America/Santiago', cutoff: '2026-09-07T03:00:00Z' };
  const metric = { value: 0, scope, period };
  const metrics = { scope, period, activeUsers: { ...metric, value: 8 }, resourceDemand: { ...metric, views: 0, requests: 0 },
    subjectDemand: { ...metric, views: 0, requests: 0, subjects: [] }, activityParticipation: { ...metric, legacyEvents: 0 } };
  const html = renderDashboard({ loading: false, error: '', dashboard: { ...metrics, notes: [], grouping: 'week', intervals: [
    { key: '2026-08-31', label: 'Semana del 2026-08-31', period, metrics, status: 'no_activity', coverage: 'partial' },
    { key: '2026-09-07', label: 'Semana del 2026-09-07', period: { ...period, from: '2026-09-07', to: '2026-09-13' }, metrics: null, status: 'unavailable', coverage: 'unavailable' },
  ] } });
  for (const text of ['Evolución semanal', 'Semana del 2026-08-31',
    'America/Santiago', 'Vistas: 0', 'No se registraron vistas ni solicitudes', 'Espacio vacío = sin datos disponibles',
    'Gráfico', 'Tabla', 'Ver período Semana del 2026-08-31']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('El historial puede estar incompleto'));
});

test('tapping chart intervals and switching to table preserves original values and unavailable gaps', () => {
  const scope = { institutionName: 'Institución', campusName: 'Campus' };
  const period = { from: '2026-09-01', to: '2026-09-07', timeZone: 'America/Santiago' };
  const metric = { value: 0, scope, period };
  const metrics = { scope, period, activeUsers: { ...metric, value: 8 }, resourceDemand: { ...metric, value: 5, views: 3, requests: 2 },
    subjectDemand: { ...metric, value: 5, views: 3, requests: 2, subjects: [] }, activityParticipation: { ...metric, value: 1, legacyEvents: 0 } };
  const second = { ...metrics, activeUsers: { ...metric, value: 11 }, resourceDemand: { ...metric, value: 9, views: 5, requests: 4 } };
  const intervals = [
    { key: 'first', label: 'Primer período', period, metrics, status: 'recorded', coverage: 'partial' },
    { key: 'second', label: 'Segundo período', period: { ...period, from: '2026-09-08', to: '2026-09-14' }, metrics: second, status: 'recorded', coverage: 'partial' },
    { key: 'future', label: 'Período futuro', period: { ...period, from: '2026-09-15', to: '2026-09-21' }, metrics: null, status: 'unavailable', coverage: 'unavailable' },
  ];
  const h = statefulPresentation('src/features/analytics/components/AnalyticsTrends.tsx', 'AnalyticsTrends', { dashboard: { ...metrics, grouping: 'week', intervals } });
  let html = h.render(); assert.ok(html.includes('Vistas: 3 · Solicitudes: 2')); assert.ok(html.includes('<svg'));
  h.actions.find(row => row.accessibilityLabel?.startsWith('Ver período Segundo período:')).onPress();
  html = h.render(); assert.ok(html.includes('Vistas: 5 · Solicitudes: 4')); assert.ok(!html.includes('Cuentas activas: 11'));
  h.actions.find(row => row.accessibilityLabel === 'Tabla').onPress();
  html = h.render(); assert.ok(!html.includes('<svg')); assert.ok(html.includes('Vistas: 5 · Solicitudes: 4'));
  assert.equal(h.actions.find(row => row.accessibilityLabel === 'Tabla').accessibilityState.selected, true);
  const future = h.actions.find(row => row.accessibilityLabel?.startsWith('Ver período Período futuro:'));
  assert.ok(future.accessibilityLabel.includes('No hay datos disponibles')); future.onPress();
  html = h.render(); assert.ok(selectedDetail(html).includes('No hay datos disponibles')); assert.ok(!html.includes('Cuentas activas: 0'));
  assert.equal(h.actions.find(row => row.accessibilityLabel?.startsWith('Ver período Período futuro:')).accessibilityState.selected, true);
  h.actions.find(row => row.accessibilityLabel === 'Gráfico').onPress();
  html = h.render(); assert.ok(html.includes('<svg'));
  assert.equal(h.actions.find(row => row.accessibilityLabel?.startsWith('Ver período Período futuro:')).accessibilityState.selected, true);
});

function chartFixture(values) {
  const scope = { institutionName: 'Institución con nombre largo', campusName: 'Campus principal', career: null };
  const intervals = values.map((value, index) => {
    const date = new Date(Date.UTC(2021, 0, 4 + index * 7)).toISOString().slice(0, 10);
    const period = { from: date, to: date, timeZone: 'America/Santiago', cutoff: `${date}T23:59:59Z` };
    const metric = { value: value ?? 0, scope, period };
    return { key: String(index), label: `Observación ${index + 1}`, period, status: value === null ? 'unavailable' : 'recorded', coverage: 'partial',
      metrics: value === null ? null : { scope, period, activeUsers: metric, resourceDemand: { ...metric, value: value * 2, views: value, requests: value },
        subjectDemand: { ...metric, value: value * 2, views: value, requests: value, subjects: [] }, activityParticipation: { ...metric, legacyEvents: 0 } } };
  });
  const totals = intervals.find(row => row.metrics)?.metrics ?? Object.fromEntries(Object.entries(chartFixture([0])).filter(([key]) => ['scope','period','activeUsers','resourceDemand','subjectDemand','activityParticipation'].includes(key)).map(([key,value]) => [key, value && typeof value === 'object' && 'value' in value ? { ...value, value: null } : value]));
  return { ...totals, intervals, grouping: 'week', generatedAt: '2026-10-28T12:00:00Z', notes: [] };
}
const selectedDetail = html => html.slice(html.search(/Período elegido|Semana elegida|Mes elegido/));
const plotMarkup = html => html.match(/<svg[^>]*height="220"[^>]*>([\s\S]*?)<\/svg>/)?.[1] ?? '';

test('evolution table uses original range totals, keeps null distinct from zero and never sums account balances', () => {
  const data = chartFixture([0, 4, null, 7, 8, 9, 10]);
  data.period = { from: '2021-01-04', to: '2021-02-15', timeZone: 'America/Santiago' };
  data.resourceDemand = { ...data.resourceDemand, value: 777, views: 700, requests: 77 };
  data.subjectDemand = { ...data.subjectDemand, value: 555, views: 500, requests: 55 };
  data.activityParticipation = { ...data.activityParticipation, value: 333 };
  data.activeUsers = { ...data.activeUsers, value: 222 };
  const h = statefulPresentation('src/features/analytics/components/AnalyticsTrends.tsx', 'AnalyticsTrends', { dashboard: data });
  h.render(); h.actions.find(row => row.accessibilityLabel === 'Tabla').onPress();
  let html = h.render();
  assert.ok(html.includes('Semana')); assert.ok(html.includes('Solicitudes')); assert.ok(html.includes('Sin datos'));
  assert.ok(html.includes('—')); assert.ok(html.includes('700')); assert.ok(html.includes('77'));
  assert.ok(html.includes('Total del rango completo, incluidas las demás páginas'));
  assert.equal(h.actions.filter(row => row.accessibilityLabel?.startsWith('Ver período ')).length, 6);
  h.actions.find(row => row.accessibilityLabel === 'Períodos siguientes').onPress(); html = h.render();
  assert.equal(h.actions.filter(row => row.accessibilityLabel?.startsWith('Ver período ')).length, 1);
  assert.ok(html.includes('700')); assert.ok(html.includes('77'), 'range total is unchanged by the visible page');
  for (const [kind, value] of [['cuentas', '222'], ['asignaturas', '500'], ['actividades', '333']]) {
    h.actions.find(row => row.accessibilityLabel === `Evolución de ${kind}`).onPress(); html = h.render();
    assert.ok(html.includes(value));
    if (kind === 'cuentas') { assert.ok(html.includes('Al cierre del rango')); assert.ok(html.includes('no se suman')); assert.ok(!html.includes('Total del rango')); }
  }
  data.activityParticipation.value = null; html = h.render();
  assert.ok(html.includes('No hay datos disponibles para el total del rango'));
});

test('monthly table preserves clipped dates and weekly rows preserve cross-month periods', () => {
  const data = chartFixture([3, 5]); data.grouping = 'month';
  data.intervals[0].period = { ...data.period, from: '2025-12-20', to: '2025-12-31' };
  data.intervals[1].period = { ...data.period, from: '2026-01-01', to: '2026-01-12' };
  const h = statefulPresentation('src/features/analytics/components/AnalyticsTrends.tsx', 'AnalyticsTrends', { dashboard: data });
  h.render(); h.actions.find(row => row.accessibilityLabel === 'Tabla').onPress();
  let html = h.render(); assert.ok(html.includes('2025–2026')); assert.ok(html.includes('diciembre')); assert.ok(html.includes('enero'));
  assert.ok(html.includes('20–31 dic')); assert.ok(html.includes('1–12 ene')); assert.ok(selectedDetail(html).includes('Mes elegido'));
  data.grouping = 'week'; data.intervals[0].period = { ...data.period, from: '2026-09-28', to: '2026-10-04' };
  html = h.render(); assert.ok(html.includes('28 sept–4 oct')); assert.ok(selectedDetail(html).includes('Semana elegida'));
});

test('selected period shows only the chosen indicator in graph and table, with subject exploration limited to subjects', () => {
  const kinds = [
    ['recursos', 'Recursos vistos y pedidos', 'Vistas: 4 · Solicitudes: 4'],
    ['cuentas', 'Cuentas activas', 'Cuentas activas: 4'],
    ['asignaturas', 'Interés por asignaturas', 'Vistas: 4 · Solicitudes: 4'],
    ['actividades', 'Inscripciones a actividades', 'Inscripciones a actividades: 4'],
  ];
  for (const mode of ['Gráfico', 'Tabla']) {
    const data = chartFixture([4]);
    data.intervals[0].metrics.subjectDemand.subjects = [{ subjectId: 'algebra', subjectName: 'Curso del período', views: 3, requests: 1 }];
    const h = statefulPresentation('src/features/analytics/components/AnalyticsTrends.tsx', 'AnalyticsTrends', { dashboard: data });
    h.render(); h.actions.find(row => row.accessibilityLabel === mode).onPress(); h.render();
    for (const [short, title, value] of kinds) {
      h.actions.find(row => row.accessibilityLabel === `Evolución de ${short}`).onPress();
      const html = h.render(), detail = selectedDetail(html);
      if (mode === 'Gráfico') { assert.ok(detail.includes(title)); assert.ok(detail.includes('America/Santiago')); }
      assert.ok(detail.includes(value));
      for (const [, other] of kinds) if (other !== title) assert.ok(!detail.includes(other), `${mode}/${short}: unrelated ${other}`);
      const subjects = h.actions.find(row => row.accessibilityLabel === 'Ver asignaturas del período');
      assert.equal(!!subjects, short === 'asignaturas');
      if (subjects) { subjects.onPress(); assert.ok(h.render().includes('Curso del período')); }
      else assert.ok(!detail.includes('Curso del período'));
    }
    h.actions.find(row => row.accessibilityLabel === 'Evolución de asignaturas').onPress();
    const html = h.render(); assert.ok(!html.includes('Curso del período'), 'switching indicators resets the subject expansion');
    assert.ok(h.actions.some(row => row.accessibilityLabel === 'Ver asignaturas del período'));
  }
});

test('selected metric null stays unavailable while other metrics exist, and no-activity wording follows the selected event', () => {
  for (const mode of ['Gráfico', 'Tabla']) {
    const data = chartFixture([0]);
    data.intervals[0].metrics.resourceDemand = { ...data.intervals[0].metrics.resourceDemand, value: null, views: 99, requests: 88 };
    data.intervals[0].metrics.activeUsers.value = 7; data.intervals[0].status = 'no_activity';
    const h = statefulPresentation('src/features/analytics/components/AnalyticsTrends.tsx', 'AnalyticsTrends', { dashboard: data });
    const detail = () => { const html = h.render(); return selectedDetail(html); };
    h.render(); h.actions.find(row => row.accessibilityLabel === mode).onPress();
    let text = detail(); assert.ok(text.includes('No hay datos disponibles')); assert.ok(!text.includes('99')); assert.ok(!text.includes('Cuentas activas'));
    h.actions.find(row => row.accessibilityLabel === 'Evolución de cuentas').onPress();
    text = detail(); assert.ok(text.includes('Cuentas activas: 7')); assert.ok(!text.includes('No se registraron'));
    h.actions.find(row => row.accessibilityLabel === 'Evolución de actividades').onPress();
    text = detail(); assert.ok(text.includes('Inscripciones a actividades: 0')); assert.ok(text.includes('No se registraron inscripciones'));
    assert.ok(!text.includes('vistas')); assert.ok(!text.includes('No hay datos disponibles'));
  }
});

test('both demand lines and gradient areas stop at null metrics and unavailable periods without relying only on color', () => {
  for (const unavailableWithMetrics of [false, true]) {
    const data = chartFixture([120, 180, null, 90, 140, 160]);
    if (unavailableWithMetrics) data.intervals[2].metrics = data.intervals[0].metrics;
    const h = statefulPresentation('src/features/analytics/components/AnalyticsTrends.tsx', 'AnalyticsTrends', { dashboard: data });
    const html = h.render(), plot = plotMarkup(html);
    const areas = [...plot.matchAll(/<path[^>]*d="([^"]+)"[^>]*fill="url/g)].map(match => match[1]);
    assert.equal(areas.length, 4, 'two independent areas for each of two series');
    const bounds = areas.map(path => [...path.matchAll(/([\d.]+),([\d.]+)/g)].map(match => Number(match[1]))).map(xs => [Math.min(...xs), Math.max(...xs)]);
    const gapX = (bounds[0][1] + bounds[1][0]) / 2;
    for (const [min, max] of bounds) assert.ok(max < gapX || min > gapX, 'no filled area crosses the gap');
    for (const match of plot.matchAll(/<polyline[^>]*points="([^"]+)"/g)) {
      const xs = match[1].split(' ').map(point => Number(point.split(',')[0]));
      assert.ok(Math.max(...xs) < gapX || Math.min(...xs) > gapX, 'no stroke crosses the gap');
    }
    assert.ok(plot.includes('stroke="#002E56"')); assert.ok(plot.includes('stroke="#FDBB30"'));
    assert.ok(plot.includes('stroke-dasharray="7 5"')); assert.ok(plot.includes('<polygon'));
    assert.ok(plot.includes('stroke="#795519"'), 'yellow has contrasting outline');
    const graphLabels = h.actions.filter(row => row.accessibilityLabel?.startsWith('Ver período ')).map(row => row.accessibilityLabel);
    h.actions.find(row => row.accessibilityLabel?.startsWith('Ver período Observación 3:')).onPress();
    assert.equal((plotMarkup(h.render()).match(/<circle/g) ?? []).length, 0, 'no halo or point at unavailable period');
    h.actions.find(row => row.accessibilityLabel === 'Tabla').onPress(); h.render();
    assert.deepEqual(h.actions.filter(row => row.accessibilityLabel?.startsWith('Ver período ')).map(row => row.accessibilityLabel), graphLabels);
  }
});

test('activity zero stays on baseline and very large values keep original numeric detail', () => {
  for (const value of [0, 1, 9_000_000_000_000]) {
    const data = chartFixture([value, value]);
    const h = statefulPresentation('src/features/analytics/components/AnalyticsTrends.tsx', 'AnalyticsTrends', { dashboard: data });
    h.render(); h.actions.find(row => row.accessibilityLabel === 'Evolución de actividades').onPress();
    const html = h.render(), plot = plotMarkup(html);
    assert.ok(!/NaN|Infinity/.test(plot)); assert.ok(!html.includes('El rango incluye una sola semana'));
    assert.ok(h.actions.find(row => row.accessibilityLabel?.startsWith('Ver período ')).accessibilityLabel.includes(new Intl.NumberFormat('es-CL').format(value)));
    if (value === 0) assert.equal((plot.match(/<path/g) ?? []).length, 0, 'zero never becomes a short positive bar');
    else assert.ok(/<path[^>]*d="[^"]* Q /.test(plot), 'top corners of positive bars are rounded');
  }
});

test('a single month or week gives guidance instead of an isolated graph and preserves zero, values and unavailable data', () => {
  for (const grouping of ['month', 'week']) for (const value of [0, 7, 9_000_000_000_000, null]) {
    let edits = 0;
    const h = statefulPresentation('src/features/analytics/components/AnalyticsTrends.tsx', 'AnalyticsTrends', {
      dashboard: { ...chartFixture([value]), grouping }, onEditFilters() { edits++; },
    });
    let html = h.render(); assert.ok(!html.includes('<svg'));
    assert.ok(html.includes(grouping === 'month' ? 'al menos dos meses' : 'al menos dos semanas'));
    const detail = selectedDetail(html);
    if (value === null) { assert.ok(detail.includes('No hay datos disponibles')); assert.ok(!detail.includes('Vistas: 0')); }
    else assert.ok(detail.includes(`Vistas: ${new Intl.NumberFormat('es-CL').format(value)}`));
    assert.equal(edits, 0); h.actions.find(row => row.accessibilityLabel === 'Cambiar período de analítica').onPress(); assert.equal(edits, 1);
    h.actions.find(row => row.accessibilityLabel === 'Tabla').onPress(); html = h.render();
    assert.ok(!html.includes('<svg')); assert.equal(h.actions.filter(row => row.accessibilityLabel?.startsWith('Ver período ')).length, 1);
    assert.ok(selectedDetail(html).includes(value === null ? 'No hay datos disponibles' : `Vistas: ${new Intl.NumberFormat('es-CL').format(value)}`));
  }
});

test('single-period dashboard action opens the existing filter draft without consulting or generating and saved reports offer no edit action', () => {
  let panel;
  const calls = [], state = { allowed: true, loading: false, error: '', options, identityKey: 'session',
    filters: { institutionId: 'institution-a', campusIds: ['campus-a'] }, range: { from: '2026-10-01', to: '2026-10-28', grouping: 'month' },
    dashboard: { ...chartFixture([3]), grouping: 'month' }, consult() { calls.push('consult'); }, generateReport() { calls.push('generate'); }, applyQuery(...args) { calls.push(args); },
  };
  const h = statefulPresentation('app/(analytics)/analytics.tsx', 'default', {}, {
    '@/features/analytics/hooks/useAnalyticsDashboard': { useAnalyticsDashboard: () => state },
    '@/features/analytics/components/AnalyticsFilters': { AnalyticsFilters: props => { panel = props; return null; } },
  });
  h.render(); h.actions.find(row => row.accessibilityLabel === 'Cambiar período de analítica').onPress(); h.render();
  assert.equal(panel.value.from, '2026-10-01'); assert.equal(panel.value.to, '2026-10-28'); assert.deepEqual(calls, []);
  panel.onApply({ ...panel.value, from: '2026-09-01' });
  assert.equal(calls.length, 1); assert.equal(calls[0][1], '2026-09-01'); assert.equal(calls[0][3], 'month');
  const actions = [];
  renderDashboard({ loading: false, error: '', dashboard: null, report: { ...chartFixture([3]), id: 'saved', generatedBy: { name: 'Ana' }, calculationVersion: 'v1' } }, actions);
  assert.ok(!actions.some(row => row.accessibilityLabel === 'Cambiar período de analítica'));
});

test('six and twelve period windows preserve all 260 observations and 44 px touch targets', () => {
  const native = createRequire(import.meta.url)('react-native-web');
  for (const width of [390, 1200]) {
    let onLayout; const controls = [];
    const h = statefulPresentation('src/features/analytics/components/AnalyticsTrends.tsx', 'AnalyticsTrends', { dashboard: chartFixture(Array.from({ length: 260 }, (_, index) => index)) }, {
      'react-native': { ...native, View: props => { if (props.onLayout) onLayout = props.onLayout; return React.createElement(native.View, props); },
        Pressable: props => { controls.push(props); return React.createElement(native.Pressable, props); } },
    });
    const render = () => { controls.length = 0; return h.render(); };
    render(); onLayout({ nativeEvent: { layout: { width } } }); render();
    assert.equal(controls.filter(row => row.accessibilityLabel?.startsWith('Ver período ')).length, width < 700 ? 6 : 12);
    const seen = new Set();
    for (let page = 0; page < 260; page++) {
      for (const control of controls.filter(row => row.accessibilityLabel?.startsWith('Ver período '))) {
        seen.add(control.accessibilityLabel); assert.equal(control.style.minWidth, 44);
      }
      const next = controls.find(row => row.accessibilityLabel === 'Períodos siguientes');
      if (next.disabled) break;
      next.onPress(); render();
    }
    assert.equal(seen.size, 260, 'no sampling, repeated or skipped observation');
  }
});

test('future totals render Sin datos and hide numerical demand details', () => {
  const scope = { institutionName: 'Institución', campusName: 'Principal' };
  const period = { from: '9999-12-30', to: '9999-12-31', timeZone: 'America/Santiago' };
  const metric = { value: null, scope, period };
  const html = renderDashboard({ loading: false, error: '', dashboard: { scope, period, activeUsers: metric,
    resourceDemand: { ...metric, views: 0, requests: 0 }, subjectDemand: { ...metric, views: 0, requests: 0, subjects: [] },
    activityParticipation: { ...metric, legacyEvents: 0 }, notes: [], intervals: [] } });
  assert.ok(html.split('Sin datos').length - 1 >= 4);
  assert.ok(!html.includes('0 vistas')); assert.ok(!html.includes('0 solicitudes'));
});

test('report transport posts only selected filters with the same institutional query contract', async () => {
  const observed = [], signal = new AbortController().signal;
  const { generateAnalyticalReport } = load('../src/features/analytics/api/dashboardApi.ts', {
    '@/lib/api/authenticated-request': { authenticatedEnvelopeRequest: async (path, init, query) => {
      observed.push({ path, init, query }); return { data: { generatedAt: 'server-time' } };
    } },
  });
  const data = await generateAnalyticalReport('2026-09-01', '2026-10-10', 'campus-a', signal,
    { institutionId: 'institution-a', campusIds: ['campus-a', 'campus-b'], careerId: 'career-a' }, 'week');
  assert.equal(data.generatedAt, 'server-time');
  const call = observed[0]; assert.equal(call.path, '/api/v1/analytics/reports'); assert.equal(call.query, undefined);
  assert.equal(call.init.method, 'POST'); assert.equal(call.init.signal, signal);
  assert.equal(call.init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(call.init.body), { from: '2026-09-01', to: '2026-10-10', grouping: 'week',
    institutionId: 'institution-a', campusIds: 'campus-a,campus-b', careerId: 'career-a' });
});

test('report generation is explicit, sends the requested dates/grouping and discards previous dashboard responses', async () => {
  const h = harness();
  try {
    await h.ready(); assert.ok(!h.calls[0].report);
    h.render().generateReport('2026-09-01', '2026-09-30', 'week');
    assert.equal(h.render().dashboard, null); assert.equal(h.render().report, null); assert.ok(h.render().reportRequested);
    assert.equal(h.calls[0].signal.aborted, true);
    await h.ready(); const call = h.calls[1];
    assert.equal(call.report, true); assert.equal(call.from, '2026-09-01'); assert.equal(call.to, '2026-09-30');
    assert.equal(call.grouping, 'week'); assert.equal(call.filters.campusIds[0], 'campus-a');
    h.calls[0].resolve({ marker: 'late-dashboard' }); await setImmediate(); assert.equal(h.render().report, null);
    call.resolve({ marker: 'report', generatedBy: { name: 'Server user' } }); await setImmediate();
    assert.equal(h.render().dashboard, null); assert.equal(h.render().report.marker, 'report');
    h.render().consult('2026-09-01', '2026-09-30'); assert.equal(h.render().report, null);
    await h.ready(); assert.ok(!h.calls[2].report);
  } finally { h.dispose(); }
});

test('filter changes, identity changes and unmount hide reports and discard late generations', async () => {
  const h = harness();
  try {
    await h.ready();
    h.render().generateReport('2026-09-01', '2026-09-30', 'month'); await h.ready();
    const first = h.calls.at(-1);
    h.render().selectFilters({ institutionId: 'institution-a', campusIds: ['campus-b'] });
    assert.equal(h.render().report, null); assert.equal(h.render().reportRequested, false); assert.ok(first.signal.aborted);
    first.resolve({ marker: 'wrong-campus' }); await setImmediate(); assert.equal(h.render().report, null);
    h.render().generateReport('2026-09-01', '2026-09-30', 'month'); await h.ready();
    const second = h.calls.at(-1);
    second.resolve({ marker: 'current' }); await setImmediate(); assert.equal(h.render().report.marker, 'current');
    h.auth.identity.userId = 'new-user'; assert.equal(h.render().report, null); assert.equal(h.render().options, null);
    await h.ready(); assert.ok(!h.calls.at(-1).report);
    h.render().generateReport('2026-09-01', '2026-09-30', 'week'); await h.ready();
    const final = h.calls.at(-1); h.auth.identity.roles = []; assert.equal(h.render().report, null);
    assert.ok(final.signal.aborted); h.dispose(); final.resolve({ marker: 'revoked' }); await setImmediate();
    assert.equal(h.render().report, null);
  } finally { h.dispose(); }
});

test('failed generation clears figures, refreshes revoked identity and retries via a new report request', async () => {
  const h = harness();
  try {
    await h.ready(); h.calls[0].resolve({ marker: 'dashboard' }); await setImmediate();
    h.render().generateReport('2026-09-01', '2026-09-30', 'week'); await h.ready();
    h.calls[1].reject(new AuthApiError(403, 'Permiso revocado.')); await setImmediate();
    assert.equal(h.render().error, 'Permiso revocado.'); assert.equal(h.render().report, null);
    assert.equal(h.render().dashboard, null); assert.equal(h.refreshes, 1);
    h.render().generateReport('2026-09-01', '2026-09-30', 'week'); await h.ready();
    assert.equal(h.calls[2].report, true); assert.equal(h.calls[2].grouping, 'week');
    h.calls[2].reject(new Error('network')); await setImmediate();
    assert.equal(h.render().error, 'No se pudo generar el reporte. Inténtalo nuevamente.');
  } finally { h.dispose(); }
});

test('report view presents server scope, period, grouping, generation time and responsible alongside the same KPI', () => {
  const scope = { institutionName: 'Institución del reporte', campusName: 'Principal, Otra',
    campuses: [{ id: 'a', name: 'Principal' }, { id: 'b', name: 'Otra' }], career: null };
  const period = { from: '2026-09-01', to: '2026-09-30', timeZone: 'America/Santiago' };
  const metric = { value: 0, scope, period }, report = { id: 'saved-report-id', scope, period, generatedAt: '2026-10-22T16:35:42Z',
    generatedBy: { name: 'Responsable del servidor' }, grouping: 'week', activeUsers: { ...metric, value: 7 },
    resourceDemand: { ...metric, views: 0, requests: 0 }, subjectDemand: { ...metric, views: 0, requests: 0, subjects: [] },
    activityParticipation: { ...metric, legacyEvents: 0 }, intervals: [], notes: [] };
  let argumentsReceived;
  const actions = [], html = renderDashboard({ report, loading: false, error: '', dashboard: null, options,
    filters: { institutionId: 'institution-a', campusIds: ['campus-a'] }, generateReport(...args) { argumentsReceived = args; } }, actions);
  for (const text of ['Estas cifras son una copia fija: no cambian al actualizar el tablero.',
     'Institución del reporte', 'Principal, Otra', 'Todas, incluye sin clasificar',
    'Tipo', 'Carreras', 'Semanal', 'Guardado el', '13:35:42', 'America/Santiago',
    'Responsable del servidor', 'Cuentas activas', 'Inscripciones a actividades']) assert.ok(html.includes(text), text);
  const button = actions.find(p => p.accessibilityLabel === 'Guardar otro reporte');
  assert.equal(button.disabled, false); button.onPress();
  assert.equal(argumentsReceived[2], 'month'); // El formulario se envía; no se copian los metadatos del reporte anterior.
  const loading = renderDashboard({ report: null, reportRequested: true, loading: true, error: '', dashboard: null });
  assert.ok(loading.includes('Generando reporte')); assert.ok(!loading.includes('Responsable del servidor'));
});

function renderHistory(state, actions = [], fields = []) {
  return analyticsRenderer({ '@/features/analytics/hooks/useHistoricalReports': { useHistoricalReports: () => ({
    identityKey: 'session', allowed: true, filters: {}, page: null, pageNumber: 1, visitedPages: 1, options: null, selectedIds: [], reports: [], ...state,
  }) } }, actions, fields).render('app/(analytics)/history.tsx');
}

test('shared pagination preserves known totals and supports cursor pages without announcing a fabricated total', () => {
  const actions = [], changes = [];
  let html = analyticsRenderer({}, actions).render('src/components/Pagination.tsx', 'Pagination', {
    page: 2, visitedPages: 3, hasNextPage: true, onPageChange: page => changes.push(page),
  });
  assert.ok(html.includes('Página 2, actual')); assert.ok(!html.includes(' de '));
  actions.find(row => row.accessibilityLabel === 'Página siguiente').onPress();
  actions.find(row => row.accessibilityLabel === 'Página 1').onPress(); assert.deepEqual(changes, [3, 1]);
  const last = [];
  analyticsRenderer({}, last).render('src/components/Pagination.tsx', 'Pagination', { page: 3, visitedPages: 3,
    hasNextPage: false, onPageChange() {} });
  assert.equal(last.find(row => row.accessibilityLabel === 'Página siguiente').disabled, true);
  const blocked = [];
  analyticsRenderer({}, blocked).render('src/components/Pagination.tsx', 'Pagination', { page: 2, totalPages: 4,
    disabled: true, onPageChange() { throw Error('Navigation must stay blocked'); } });
  assert.ok(blocked.every(row => row.disabled)); blocked.forEach(row => row.onPress());
  const total = [];
  html = analyticsRenderer({}, total).render('src/components/Pagination.tsx', 'Pagination', { page: 2, totalPages: 4,
    onPageChange: page => changes.push(page) });
  assert.ok(html.includes('Página 2 de 4, actual')); assert.ok(html.includes('Página 2 de 4'));
  total.find(row => row.accessibilityLabel === 'Página anterior').onPress(); assert.equal(changes.at(-1), 1);
});

test('history connects shared refresh, blocks it during loading or denied access and renders card skeletons', () => {
  let refresh, count = 0;
  const state = { identityKey: 'session', allowed: true, loading: false, filters: {}, pageNumber: 1, visitedPages: 1,
    options: null, selectedIds: [], reports: [], page: { items: [], nextCursor: null }, refresh() { count++; } };
  const overrides = { '@/features/analytics/hooks/useHistoricalReports': { useHistoricalReports: () => state },
    '@/components/RefreshScrollView': { RefreshScrollView: props => { refresh = props; return props.children; } } };
  let html = analyticsRenderer(overrides).render('app/(analytics)/history.tsx');
  assert.equal(refresh.refreshEnabled, true); assert.equal(refresh.refreshLabel, 'los reportes guardados');
  refresh.onRefresh(); assert.equal(count, 1);
  state.loading = true; state.page = null;
  html = analyticsRenderer(overrides).render('app/(analytics)/history.tsx');
  assert.equal(refresh.refreshEnabled, false); assert.equal(refresh.refreshing, true);
  assert.ok(html.includes('Cargando historial')); assert.ok(html.includes('aria-busy="true"')); assert.ok(!html.includes('Cuentas activas'));
  state.loading = false; state.allowed = false;
  analyticsRenderer(overrides).render('app/(analytics)/history.tsx'); assert.equal(refresh.refreshEnabled, false);
});

test('saved report cards expose unique human labels, civil filter dates and honest cursor counts', () => {
  const report = { ...chartFixture([3]), id: '11111111-1111-4111-8111-111111111111', generatedBy: { name: 'Original', email: 'original@duocuc.cl' }, calculationVersion: 'campuslink-kpi-v1' };
  report.scope.campuses = [{ id: 'one', name: 'San Andrés' }]; report.scope.campusName = 'San Andrés';
  const actions = [], html = renderHistory({ filters: { from: '2026-09-01' }, page: { items: [report, { ...report, id: '22222222-2222-4222-8222-222222222222' }], nextCursor: 'more' } }, actions);
  const labels = actions.filter(row => /^Abrir reporte|^Comparar con reporte/.test(row.accessibilityLabel ?? '')).map(row => row.accessibilityLabel);
  assert.equal(new Set(labels).size, 4); assert.ok(labels.every(label => !label.includes(report.id)));
  assert.ok(html.includes('Período analizado')); assert.ok(html.includes('Guardado el')); assert.ok(html.includes('Mostrando los 2 más recientes'));
  assert.ok(html.includes('original@duocuc.cl')); assert.ok(!html.includes('Correo no registrado'));
  assert.ok(html.includes('Desde el 1 sept 2026')); assert.ok(!html.includes('2026-09-01')); assert.ok(!html.includes('Hasta hoy'));
  assert.ok(html.includes('Página siguiente')); assert.ok(!html.includes('Página 1 de')); assert.ok(!html.includes('Filtros aplicados.'));
});

test('historical applied-filter disclosure shows optional bounds and original applied scope without querying or clearing comparison', () => {
  let queries = 0;
  const state = { identityKey: 'session', allowed: true, filters: { campusIds: ['one', 'retired'], careerId: 'career', from: '2026-09-01', grouping: 'week' },
    options: { institutions: [{ id: 'institution', name: 'Institución', campuses: [{ id: 'one', name: 'Campus conocido' }], careers: [{ id: 'career', name: 'Carrera aplicada' }] }] },
    page: { items: [], nextCursor: 'next' }, selectedIds: ['report-a'], reports: [], search() { queries++; } };
  const h = statefulPresentation('app/(analytics)/history.tsx', 'default', {}, { '@/features/analytics/hooks/useHistoricalReports': { useHistoricalReports: () => state } });
  let html = h.render();
  assert.ok(!html.includes('Por semana')); assert.ok(html.includes('Desde el 1 sept 2026'));
  h.actions.find(row => row.accessibilityLabel === 'Expandir filtros aplicados').onPress(); html = h.render();
  for (const text of ['Sedes', 'Campus conocido', 'Campus seleccionado (fuera del catálogo actual)', 'Carreras', 'Carrera aplicada', 'Período', 'Agrupación', 'Por semana']) assert.ok(html.includes(text), text);
  assert.equal(h.actions.find(row => row.accessibilityLabel === 'Contraer filtros aplicados')['aria-expanded'], true);
  state.filters = { to: '2026-10-28' }; html = h.render();
  for (const text of ['Todos los campus autorizados', 'Todas las carreras (incluye sin clasificar)', 'Hasta el 28 oct 2026', 'Semana y mes']) assert.ok(html.includes(text), text);
  assert.equal(queries, 0); assert.deepEqual(state.selectedIds, ['report-a']); assert.equal(state.page.nextCursor, 'next');
  h.actions.find(row => row.accessibilityLabel === 'Contraer filtros aplicados').onPress(); h.render();
  assert.ok(h.actions.some(row => row.accessibilityLabel === 'Expandir filtros aplicados'));
  h.actions.find(row => row.accessibilityLabel === 'Expandir filtros aplicados').onPress(); h.render();
  state.identityKey = 'other-session'; h.render();
  assert.ok(h.actions.some(row => row.accessibilityLabel === 'Expandir filtros aplicados'));
});

test('historical detail puts original figures before downloads and ends with return, without X or compare action', () => {
  const report = { ...chartFixture([3]), id: 'saved-original', generatedBy: { name: 'Autor original', userId: 'user-original' }, calculationVersion: 'campuslink-kpi-v1' };
  report.scope.institutionId = 'institution-original'; report.scope.campuses = [{ id: 'campus-original', name: 'Campus original' }];
  const state = { identityKey: 'session', allowed: true, filters: {}, page: { items: [report], nextCursor: null }, selectedIds: [], reports: [], options: null,
    open(id) { this.selectedIds = [id]; this.reports = [report]; }, close() { this.selectedIds = []; this.reports = []; } };
  const h = statefulPresentation('app/(analytics)/history.tsx', 'default', {}, { '@/features/analytics/hooks/useHistoricalReports': { useHistoricalReports: () => state } });
  h.render(); h.actions.find(row => row.accessibilityLabel?.startsWith('Abrir reporte 1,')).onPress(); let html = h.render();
  const download = html.indexOf('Descargar este reporte');
  assert.ok(html.indexOf('Cuentas activas') < download); assert.ok(html.lastIndexOf('Interés por asignatura') < download);
  assert.ok(html.includes('Estas cifras son una copia fija')); assert.ok(!html.includes('Corte exclusivo:'));
  assert.ok(!html.includes('Detalles técnicos'));
  assert.ok(!h.actions.some(row => row.accessibilityLabel === 'Cambiar período de analítica'));
  const back = html.indexOf('Volver a reportes guardados');
  assert.ok(!html.includes('Elegir otro reporte para comparar')); assert.ok(back > download);
  assert.ok(!h.actions.some(row => row.accessibilityLabel === 'Cerrar reporte guardado'));
  const originalPage = state.page, originalFilters = state.filters;
  h.actions.find(row => row.accessibilityLabel === 'Volver a reportes guardados').onPress(); html = h.render();
  assert.deepEqual(state.selectedIds, []); assert.deepEqual(state.reports, []);
  assert.equal(state.page, originalPage); assert.equal(state.filters, originalFilters);
  assert.ok(!html.includes('Detalles técnicos'));
  assert.ok(h.actions.some(row => row.accessibilityLabel?.startsWith('Abrir reporte 1,')));
});

test('history screen renders original metadata and both saved results; actions open/compare without generation', () => {
  const scope = { institutionName: 'Institución histórica', campusName: 'Sede original',
    campuses: [{ id: 'a', name: 'Sede original' }], career: { id: 'career-old', name: 'Carrera original' } };
  const period = { from: '2026-09-01', to: '2026-09-30', timeZone: 'America/Santiago', cutoff: '2026-10-01T03:00:00Z' };
  const metric = { value: 0, scope, period };
  const report = { id: 'snapshot-a', scope, period, generatedAt: '2026-10-22T16:35:42Z',
    generatedBy: { name: 'Responsable original' }, calculationVersion: 'campuslink-kpi-v1', grouping: 'week',
    activeUsers: { ...metric, value: 7 }, resourceDemand: { ...metric, views: 0, requests: 0 },
    subjectDemand: { ...metric, views: 0, requests: 0, subjects: [] }, activityParticipation: { ...metric, legacyEvents: 0 },
    intervals: [{ key: 'week', label: 'Semana guardada', period, metrics: null, status: 'unavailable', coverage: 'unavailable' }], notes: ['Nota histórica guardada'] };
  const other = { ...report, id: 'snapshot-b', activeUsers: { ...metric, value: 9 } };
  const opened = [], actions = [], html = renderHistory({ page: { items: [report, other], nextCursor: 'page2' },
    selectedIds: ['snapshot-a', 'snapshot-b'], reports: [report, other],
    open(...args) { opened.push(args); }, nextPage() {}, close() {}, search() {},
  }, actions);
  for (const text of ['Reportes guardados', 'Institución histórica', 'Sede original', 'Carrera original', 'Responsable original',
    '13:35:42', 'Correo no registrado']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('Generar reporte'));
  actions.find(action => action.accessibilityLabel?.startsWith('Abrir reporte 1,')).onPress();
  actions.find(action => action.accessibilityLabel?.startsWith('Comparar con reporte 2,')).onPress();
  assert.deepEqual(opened, [['snapshot-a', false], ['snapshot-b', true]]);
  const comparison = analyticsRenderer().render('src/features/analytics/components/ReportComparison.tsx', 'ReportComparison', { reports: [report, other] });
  assert.ok(comparison.includes('Cuentas activas'));
  assert.ok(comparison.includes('>7<')); assert.ok(comparison.includes('>9<'));
  assert.ok(comparison.includes('Reporte A')); assert.ok(comparison.includes('Reporte B'));
  assert.ok(comparison.includes('Las cifras no se recalculan.'));
});

test('each history card starts comparison and the persistent A selection survives another list page', () => {
  const scope = { institutionName: 'Institución', campusName: 'Campus', campuses: [{ id: 'campus', name: 'Campus' }], career: null };
  const period = { from: '2026-09-01', to: '2026-09-30', timeZone: 'America/Santiago' };
  const report = { id: 'a', scope, period, grouping: 'week', generatedAt: '2026-10-22T16:35:42Z', generatedBy: { name: 'Responsable' } };
  const other = { ...report, id: 'b' }, actions = [], opened = [];
  renderHistory({ page: { items: [report, other], nextCursor: 'page-two' }, open(...args) { opened.push(args); } }, actions);
  assert.equal(actions.filter(row => row.accessibilityLabel?.startsWith('Comparar con reporte ')).length, 2);
  actions.find(row => row.accessibilityLabel?.startsWith('Comparar con reporte 1,')).onPress();
  assert.deepEqual(opened, [['a']]);
  const nextActions = [], page = renderHistory({ selectedIds: ['a'], reports: [report], page: { items: [other], nextCursor: null },
    open(...args) { opened.push(args); }, close() { opened.push('closed'); } }, nextActions);
  assert.ok(page.includes('Falta elegir B')); assert.ok(page.includes('incluso en otra página'));
  nextActions.find(row => row.accessibilityLabel?.startsWith('Comparar con reporte 1,')).onPress();
  assert.deepEqual(opened.at(-1), ['b', true]);
  nextActions.find(row => row.accessibilityLabel === 'Quitar selección').onPress(); assert.equal(opened.at(-1), 'closed');
});

test('history exposes cursor navigation, clear filters, denied access, loading, empty and errors without figures', () => {
  const calls = [], actions = [], fields = [];
  let html = renderHistory({ options, filters: { from: '2026-10-01' }, page: { items: [], nextCursor: 'next' }, hasPrevious: true, pageNumber: 2, visitedPages: 2,
    search(filters) { calls.push(filters); }, goToPage(page) { calls.push(page); },
  }, actions, fields);
  assert.ok(html.includes('Sin coincidencias')); assert.equal(fields.length, 0);
  actions.find(row => row.accessibilityLabel === 'Limpiar filtros').onPress();
  actions.find(row => row.accessibilityLabel === 'Página siguiente').onPress();
  actions.find(row => row.accessibilityLabel === 'Página anterior').onPress();
  assert.deepEqual(calls.map(value => value && typeof value === 'object' ? Object.keys(value) : value), [[], 3, 1]);
  html = renderHistory({ allowed: false }); assert.ok(html.includes('Ya no tienes acceso a estas cifras'));
  html = renderHistory({ loading: true }); assert.ok(html.includes('Cargando historial'));
  html = renderHistory({ page: { items: [], nextCursor: null } }); assert.ok(html.includes('Aún no hay reportes guardados'));
  const errors = []; html = renderHistory({ error: 'Sin conexión', refresh() { errors.push('list'); } }, errors);
  assert.ok(html.includes('Sin conexión')); assert.ok(!html.includes('Cuentas activas'));
  errors.find(row => row.accessibilityLabel === 'Reintentar consulta').onPress();
  assert.deepEqual(errors.filter(row => typeof row === 'string'), ['list']);
});

test('applying the entire query retires old scope and dates together and performs one new calculation', async () => {
  const h = harness();
  try {
    await h.ready(); const old = h.calls[0];
    h.render().applyQuery({ institutionId: 'institution-a', campusIds: ['campus-b'], careerId: 'career-a' }, '2026-08-01', '2026-09-30', 'week');
    assert.equal(h.render().dashboard, null); assert.ok(old.signal.aborted);
    assert.equal(h.calls.length, 1);
    await h.ready(); assert.equal(h.calls.length, 2);
    const next = h.calls[1]; assert.equal(next.from, '2026-08-01'); assert.equal(next.to, '2026-09-30'); assert.equal(next.grouping, 'week');
    assert.deepEqual([...next.filters.campusIds], ['campus-b']); assert.equal(next.filters.careerId, 'career-a');
    old.resolve({ marker: 'old-scope' }); await setImmediate(); assert.equal(h.render().dashboard, null);
  } finally { h.dispose(); }
});

test('repeated clicks and renders cannot duplicate a pending explicit report generation', async () => {
  const h = harness();
  try {
    await h.ready(); const state = h.render();
    state.generateReport('2026-09-01', '2026-09-30', 'month');
    state.generateReport('2026-09-01', '2026-09-30', 'month');
    await h.ready(); h.render(); h.render();
    assert.equal(h.calls.filter(row => row.report).length, 1);
    const job = h.calls.find(row => row.report);
    h.render().generateReport('2026-09-01', '2026-09-30', 'month');
    assert.equal(h.calls.filter(row => row.report).length, 1);
    job.resolve({ marker: 'saved-once' }); await setImmediate(); assert.equal(h.render().report.marker, 'saved-once');
  } finally { h.dispose(); }
});

test('catalog failure during explicit generation sends no POST and finishes loading', async () => {
  const h = harness();
  try {
    await h.ready(); h.render().generateReport('2026-09-01', '2026-09-30', 'month'); h.render();
    h.optionCalls.at(-1).reject(new Error('unavailable')); await setImmediate();
    assert.equal(h.calls.filter(row => row.report).length, 0);
    assert.equal(h.render().loading, false); assert.ok(h.render().error); assert.equal(h.render().report, null);
  } finally { h.dispose(); }
});

test('civil dates, calendar adapters and institutional shortcuts preserve dates across device zones and year boundaries', () => {
  const { validCivilDate, pickerValue, civilValue, monthRange, rangeError, compactPeriodLabel, savedReportPeriodLabel, savedReportTimeLabel, savedReportListTimeLabel } = analyticsRenderer().load('src/features/analytics/utils/presentation.ts');
  assert.equal(validCivilDate('2026-02-29'), false); assert.equal(validCivilDate('2024-02-29'), true);
  assert.equal(civilValue('31/02/2026'), ''); assert.equal(civilValue('06/09/2026'), '2026-09-06');
  assert.equal(pickerValue('2026-09-06'), '06/09/2026');
  assert.equal(compactPeriodLabel({ from: '2026-10-01', to: '2026-10-28' }), '1–28 oct');
  assert.equal(compactPeriodLabel({ from: '2026-10-28', to: '2026-10-28' }), '28 oct');
  assert.equal(compactPeriodLabel({ from: '2026-10-31', to: '2026-11-01' }), '31 oct–1 nov');
  assert.match(compactPeriodLabel({ from: '2025-12-31', to: '2026-01-01' }), /2025.*2026/);
  assert.equal(savedReportPeriodLabel({ from: '2026-10-01', to: '2026-10-28' }), '1–28 oct 2026');
  assert.equal(savedReportPeriodLabel({ from: '2026-10-28', to: '2026-10-28' }), '28 oct 2026');
  assert.match(savedReportPeriodLabel({ from: '2025-12-31', to: '2026-01-01' }), /2025.*2026/);
  assert.equal(savedReportTimeLabel('2026-10-29T01:05:00Z', 'America/Santiago', new Date('2026-10-28T23:30:00Z')), 'Hoy 22:05');
  assert.equal(savedReportTimeLabel('2026-10-29T03:05:00Z', 'America/Santiago', new Date('2026-10-29T02:30:00Z')), '29 oct 2026 00:05');
  assert.match(savedReportListTimeLabel('2025-10-22T16:35:42Z', 'America/Santiago', new Date('2026-10-28T12:00:00Z')), /2025.*13:35/);
  const sameYear = savedReportListTimeLabel('2026-10-22T16:35:42Z', 'America/Santiago', new Date('2026-10-28T12:00:00Z'));
  assert.ok(sameYear.includes('13:35')); assert.ok(!sameYear.includes('2026'));
  const october = monthRange(false, new Date('2026-11-01T02:30:00Z'));
  assert.equal(october.from, '2026-10-01'); assert.equal(october.to, '2026-10-31');
  const december = monthRange(true, new Date('2026-01-15T12:00:00Z'));
  assert.equal(december.from, '2025-12-01'); assert.equal(december.to, '2025-12-31');
  assert.equal(monthRange(true, new Date('2024-03-15T12:00:00Z')).to, '2024-02-29');
  assert.ok(rangeError('2026-10-31', '2026-10-01')); assert.equal(rangeError('', '', true), '');
});

test('historical filters accept no campus or dates even when the current catalog is unavailable', () => {
  const calls = [], actions = [];
  const html = analyticsRenderer({}, actions).render('src/features/analytics/components/AnalyticsFilters.tsx', 'AnalyticsFilters', {
    value: {}, options: null, historical: true, onApply: value => calls.push(value), onClose() {},
  });
  assert.ok(html.includes('también los históricos')); assert.ok(!html.includes('Selecciona al menos un campus.'));
  const apply = actions.find(row => row.accessibilityLabel === 'Guardar filtros'); assert.equal(apply.disabled, false); apply.onPress();
  assert.equal(calls[0].campusIds.length, 0); assert.equal(calls[0].from, undefined); assert.equal(calls[0].to, undefined);
});
