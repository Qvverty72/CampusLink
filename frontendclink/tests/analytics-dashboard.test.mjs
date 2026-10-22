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
function harness() {
  const calls = [], optionCalls = [], slots = []; let cursor = 0, effects = [], refreshes = 0;
  const auth = { identity: { userId: 'user-a', campusId: 'campus-a', profile: { institucion_id: 'institution-a', estado_cuenta: 'ACTIVA', deleted_at: null },
    roles: [{ name: 'ADMINISTRADOR', campusId: 'campus-a' }], permissions: [], capabilities: { reports: true } }, refreshIdentity() { refreshes++; } };
  const react = {
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
  const { useAnalyticsDashboard } = load('../src/features/analytics/hooks/useAnalyticsDashboard.ts', {
    react, '@/features/auth/hooks/useAuth': { useAuth: () => auth }, '@/lib/api/authenticated-request': { AuthApiError },
    '../types/access': access,
    '../api/dashboardApi': {
      loadDashboardOptions: signal => new Promise((resolve, reject) => optionCalls.push({ signal, resolve, reject })),
      loadDashboard: (from, to, campusId, signal, filters) => new Promise((resolve, reject) => calls.push({ from, to, campusId, signal, filters, resolve, reject })),
    },
  });
  const h = { auth, calls, optionCalls, get refreshes() { return refreshes; },
    render() {
      cursor = 0; const result = useAnalyticsDashboard({ from: '2026-10-01', to: '2026-10-10' });
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
    { institutionId: 'institution-a', campusIds: ['campus-a', 'campus-b'], careerId: 'career-a' });
  assert.equal(observed[1].query.get('campusIds'), 'campus-a,campus-b'); assert.equal(observed[1].query.get('careerId'), 'career-a');
  assert.equal(observed[1].query.get('institutionId'), 'institution-a'); assert.equal(observed[1].query.has('campusId'), false);
  await loadDashboardOptions(controller.signal); assert.equal(observed[2].path, '/api/v1/analytics/options');
  assert.equal(observed[2].signal, controller.signal);
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

function renderDashboard(state, actions = []) {
  const require = createRequire(import.meta.url);
  const native = require('react-native-web');
  const { default: Screen } = load('../app/(analytics)/analytics.tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': { ...native,
      Pressable: props => { actions.push(props); return React.createElement(native.Pressable, props); } },
    '@/components/navigation/BottomNavigationBar': { BottomNavigationBar: () => null },
    '@/features/analytics/hooks/useAnalyticsDashboard': { useAnalyticsDashboard: () => ({ consult() {}, ...state }) },
  });
  const messages = [], originalError = console.error;
  console.error = (...args) => messages.push(args.join(' '));
  try {
    const html = renderToStaticMarkup(React.createElement(Screen));
    assert.deepEqual(messages.filter(message => message.includes('Unexpected text node')), []);
    return html;
  } finally { console.error = originalError; }
}

test('real dashboard renders four KPI with scope and period, separate demand counts and participation meaning', () => {
  const scope = { institutionName: 'Institución de prueba', campusName: 'Sede de prueba' };
  const period = { from: '2026-10-01', to: '2026-10-10', timeZone: 'UTC' };
  const metric = value => ({ value, scope, period });
  const html = renderDashboard({ loading: false, error: '', dashboard: { scope, period,
    activeUsers: metric(10), resourceDemand: { ...metric(5), views: 3, requests: 2 },
    subjectDemand: { ...metric(5), views: 3, requests: 2, subjects: [{ subjectId: 'subject-a', subjectName: 'Álgebra', views: 3, requests: 2 }] },
    activityParticipation: { ...metric(7), legacyEvents: 1 }, notes: ['Cobertura parcial de prueba.'],
  } });
  for (const title of ['Usuarios activos al corte', 'Demanda de recursos', 'Demanda de asignaturas', 'Participación en actividades']) assert.ok(html.includes(title), title);
  assert.equal(html.split('2026-10-01 al 2026-10-10').length - 1, 4);
  assert.equal(html.split('Institución de prueba').length - 1, 5);
  assert.ok(html.includes('vistas')); assert.ok(html.includes('solicitudes')); assert.ok(html.includes('Álgebra'));
  assert.ok(html.includes('no representa asistencia presencial')); assert.ok(html.includes('historial importado parcialmente'));
  assert.ok(html.includes('Cobertura parcial de prueba.'));
});

test('real dashboard error/loading states keep filters and retry available without rendering misleading KPI', () => {
  const failed = renderDashboard({ dashboard: null, error: 'No se pudo consultar el tablero.', loading: false });
  assert.ok(failed.includes('Reintentar consulta')); assert.ok(failed.includes('role="alert"'));
  assert.ok(!failed.includes('Usuarios activos al corte'));
  const loading = renderDashboard({ dashboard: null, error: '', loading: true });
  assert.ok(loading.includes('Cargando indicadores')); assert.ok(loading.includes('Fecha inicial'));
  assert.ok(!loading.includes('Participación en actividades'));
});

test('real selectors toggle multiple campuses, select/reset career and block empty-campus submission', () => {
  const state = { options, filters: { institutionId: 'institution-a', campusIds: ['campus-a'] }, loading: false, error: '', dashboard: null,
    selectFilters(next) { state.filters = next; } };
  let actions = []; const html = renderDashboard(state, actions);
  assert.ok(html.includes('Principal')); assert.ok(html.includes('Otra')); assert.ok(html.includes('Informática'));
  assert.ok(!html.includes('Ajena'));
  actions.find(p => p.accessibilityRole === 'checkbox' && !p.accessibilityState.checked).onPress();
  assert.deepEqual([...state.filters.campusIds], ['campus-a', 'campus-b']);
  actions = []; renderDashboard(state, actions);
  actions.find(p => p.accessibilityRole === 'radio' && p.children.props.children === 'Informática').onPress();
  assert.equal(state.filters.careerId, 'career-a');
  for (const id of ['campus-a', 'campus-b']) {
    actions = []; renderDashboard(state, actions);
    actions.filter(p => p.accessibilityRole === 'checkbox').find((p, i) => i === (id === 'campus-a' ? 0 : 1)).onPress();
  }
  assert.deepEqual([...state.filters.campusIds], []); assert.equal(state.filters.careerId, undefined);
  actions = []; const empty = renderDashboard(state, actions);
  assert.ok(empty.includes('Selecciona al menos un campus.'));
  assert.equal(actions.find(p => p.accessibilityRole === 'button').disabled, true);
});

test('each card displays the selected career alongside all-campus scope', () => {
  const scope = { institutionName: 'Institución', campusName: 'Principal, Otra', career: { id: 'career-a', name: 'Informática' } };
  const period = { from: '2026-10-01', to: '2026-10-10' }, metric = { value: 0, scope, period };
  const html = renderDashboard({ loading: false, error: '', dashboard: { scope, period,
    activeUsers: metric, resourceDemand: { ...metric, views: 0, requests: 0 },
    subjectDemand: { ...metric, views: 0, requests: 0, subjects: [] }, activityParticipation: { ...metric, legacyEvents: 0 }, notes: [] } });
  assert.equal(html.split('Carrera: Informática').length - 1, 4);
  assert.equal(html.split('Principal, Otra').length - 1, 5);
});
