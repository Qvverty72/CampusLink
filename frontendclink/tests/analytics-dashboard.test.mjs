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

// Ejecuta estado y efectos del hook real, conservando cleanup entre renders.
function harness() {
  const calls = [], slots = []; let cursor = 0, effects = [], refreshes = 0;
  const auth = { identity: { userId: 'user-a', campusId: 'campus-a', profile: { institucion_id: 'institution-a' },
    roles: [], permissions: [], capabilities: { reports: true } }, refreshIdentity() { refreshes++; } };
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
  const { useAnalyticsDashboard } = load('../src/features/analytics/hooks/useAnalyticsDashboard.ts', {
    react, '@/features/auth/hooks/useAuth': { useAuth: () => auth }, '@/lib/api/authenticated-request': { AuthApiError },
    '../api/dashboardApi': { loadDashboard: (from, to, campusId, signal) => new Promise((resolve, reject) =>
      calls.push({ from, to, campusId, signal, resolve, reject })) },
  });
  return { auth, calls, get refreshes() { return refreshes; },
    render() {
      cursor = 0; const result = useAnalyticsDashboard({ from: '2026-10-01', to: '2026-10-10' });
      const pending = effects; effects = []; pending.forEach(effect => effect()); return result;
    }, dispose() { slots.forEach(slot => slot?.cleanup?.()); } };
}

test('dashboard API sends explicit campus and civil dates through the existing authenticated transport', async () => {
  const controller = new AbortController(); let observed;
  const { loadDashboard } = load('../src/features/analytics/api/dashboardApi.ts', {
    '@/lib/api/authenticated-request': { authenticatedEnvelopeRequest: async (path, init, query) => {
      observed = { path, signal: init.signal, query: query.toString() }; return { data: { value: 42 } };
    } },
  });
  assert.equal((await loadDashboard('2026-10-01', '2026-10-10', 'campus-a', controller.signal)).value, 42);
  assert.equal(observed.path, '/api/v1/analytics/dashboard'); assert.equal(observed.signal, controller.signal);
  assert.equal(observed.query, 'from=2026-10-01&to=2026-10-10&campusId=campus-a');
});

test('changing campus or account hides prior KPI immediately and discards late responses even if transport ignores abort', async () => {
  const h = harness();
  try {
    assert.equal(h.render().loading, true); assert.equal(h.calls.length, 1);
    h.calls[0].resolve({ marker: 'old-campus' }); await setImmediate(); assert.equal(h.render().dashboard.marker, 'old-campus');
    h.auth.identity.campusId = 'campus-b'; assert.equal(h.render().dashboard, null);
    assert.equal(h.calls[0].signal.aborted, true); assert.equal(h.calls[1].campusId, 'campus-b');
    h.auth.identity.userId = 'user-b'; assert.equal(h.render().dashboard, null); assert.equal(h.calls.length, 3);
    h.calls[1].resolve({ marker: 'late-old-user' }); await setImmediate(); assert.equal(h.render().dashboard, null);
    h.calls[2].resolve({ marker: 'current' }); await setImmediate(); assert.equal(h.render().dashboard.marker, 'current');
    h.auth.identity.capabilities.reports = false;
    const denied = h.render(); assert.equal(denied.dashboard, null); assert.equal(denied.loading, false);
    assert.equal(h.calls[2].signal.aborted, true); assert.equal(h.calls.length, 3);
  } finally { h.dispose(); }
});

test('new date queries clear old data, permit retries with the same range and refresh identity on 401/403', async () => {
  const h = harness();
  try {
    h.render(); h.calls[0].resolve({ marker: 'initial' }); await setImmediate();
    h.render().consult('2026-09-01', '2026-09-30'); assert.equal(h.render().dashboard, null);
    assert.equal(h.calls[1].from, '2026-09-01'); assert.equal(h.calls[1].to, '2026-09-30');
    h.calls[1].reject(new AuthApiError(503, 'Vuelve a intentarlo.')); await setImmediate();
    assert.equal(h.render().error, 'Vuelve a intentarlo.'); assert.equal(h.refreshes, 0);
    for (const status of [401, 403]) {
      h.render().consult('2026-09-01', '2026-09-30'); h.render();
      h.calls.at(-1).reject(new AuthApiError(status)); await setImmediate();
      assert.equal(h.render().dashboard, null);
    }
    assert.equal(h.refreshes, 2);
  } finally { h.dispose(); }
});

test('grant changes and signout retire metrics, and an unmounted request cannot repopulate the hook', async () => {
  const h = harness();
  h.render(); h.calls[0].resolve({ marker: 'initial' }); await setImmediate(); assert.ok(h.render().dashboard);
  h.auth.identity.permissions = [{ name: 'ACCEDER_REPORTERIA', campusId: 'campus-a' }];
  assert.equal(h.render().dashboard, null); assert.equal(h.calls.length, 2);
  h.auth.identity = null; assert.equal(h.render().dashboard, null); assert.equal(h.calls[1].signal.aborted, true);
  h.dispose(); h.calls[1].resolve({ marker: 'after-unmount' }); await setImmediate(); assert.equal(h.render().dashboard, null);
});

function renderDashboard(state) {
  const require = createRequire(import.meta.url);
  const { default: Screen } = load('../app/(analytics)/analytics.tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': require('react-native-web'),
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
