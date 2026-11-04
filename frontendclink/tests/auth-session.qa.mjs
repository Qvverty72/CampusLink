// React real en navegador; SDK/API/AppState controlados para probar el hook de sesión.
// Usa esbuild ya disponible con tsx del backend y Playwright del runtime de QA.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const requireBackend = createRequire(new URL('../../backendclink/package.json', import.meta.url));
const requireFrontend = createRequire(new URL('../package.json', import.meta.url));
const { build } = requireBackend('esbuild');
const { chromium } = await import(process.env.CAMPUSLINK_PLAYWRIGHT_MODULE || 'playwright');
// Para contrastar una revisión histórica: --baseline=<git-ref> (por ejemplo b147b6e).
const baseline = process.argv.find(argument => argument.startsWith('--baseline='))?.slice('--baseline='.length);
const hookPath = resolve('src/features/auth/hooks/useAuthSession.ts');
const hook = baseline ? execFileSync('git', ['show', `${baseline}:frontendclink/src/features/auth/hooks/useAuthSession.ts`], { encoding: 'utf8' }) : await readFile(hookPath, 'utf8');
const bundle = await build({
  absWorkingDir: process.cwd(), tsconfigRaw: { compilerOptions: {} },
  stdin: { contents: `
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { useAuthSession } from './src/features/auth/hooks/useAuthSession';
    import { AuthApiError } from '@/lib/api/authenticated-request';
    const q = globalThis.__qa = { requests: [], starts: 0, stops: 0, AuthApiError };
    q.client = { auth: {
      onAuthStateChange(callback) { q.emit = callback; return { data: { subscription: { unsubscribe() { q.unsubscribed = true; } } } }; },
      startAutoRefresh() { q.starts++; }, stopAutoRefresh() { q.stops++; },
      async signOut(options) { q.signOutScope = options.scope; q.emit('SIGNED_OUT', null); return {}; },
    } };
    function Form() { const [draft, setDraft] = useState(''); const [step, setStep] = useState(1);
      return React.createElement('div', null, React.createElement('input', { value: draft, onChange: event => setDraft(event.target.value) }),
        React.createElement('button', { onClick: () => setStep(2) }, 'Continuar'), React.createElement('span', { id: 'step' }, step)); }
    function App() { q.auth = useAuthSession(); return q.auth.status === 'ready'
      ? React.createElement(Form, { key: q.auth.identity.userId + ':' + q.auth.identity.campusId }) : null; }
    const root = createRoot(document.getElementById('root')); q.unmount = () => root.unmount(); root.render(React.createElement(App));
  `, resolveDir: process.cwd(), loader: 'jsx' },
  bundle: true, write: false, format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'session-transports', setup(builder) {
    builder.onResolve({ filter: /^(react-native|@\/lib\/api\/authenticated-request|\.\.\/api\/(authApi|supabaseClient))$/ }, args => ({ path: args.path, namespace: 'qa' }));
    // Resolver con Node evita que esbuild recorra ancestros fuera del workspace restringido.
    builder.onResolve({ filter: /.*/ }, args => ({ namespace: 'source', path: args.path === './src/features/auth/hooks/useAuthSession'
      ? hookPath : (args.importer && args.importer !== '<stdin>' ? createRequire(args.importer) : requireFrontend).resolve(args.path) }));
    builder.onLoad({ filter: /.*/, namespace: 'source' }, async args => ({
      contents: args.path === hookPath ? hook : await readFile(args.path, 'utf8'), loader: args.path === hookPath ? 'ts' : 'js',
    }));
    builder.onLoad({ filter: /.*/, namespace: 'qa' }, args => ({ contents: args.path === 'react-native' ? `
      export const Platform = { OS: globalThis.__platform };
      export const AppState = { currentState: 'active', addEventListener(event, callback) {
        globalThis.__qa.activate = callback; return { remove() { globalThis.__qa.removed = true; } }; } };
    ` : args.path.endsWith('authApi') ? `
      export function loadAuthIdentity(signal) { return new Promise((resolve, reject) => globalThis.__qa.requests.push({ signal, resolve, reject })); }
    ` : args.path.endsWith('supabaseClient') ? `export const getSupabaseClient = () => globalThis.__qa.client;` : `
      export class AuthApiError extends Error { constructor(status, message, code) { super('API ' + status); this.status = status; this.code = code; } }
    `, loader: 'js' }));
  } }],
});
const browser = await chromium.launch({ channel: process.env.CAMPUSLINK_QA_BROWSER || 'msedge', headless: true });
const identity = (userId = 'actor', campusId = 'campus') => ({ userId, campusId, profile: { id: userId }, capabilities: { general: true } });
const session = (userId = 'actor', token = 'token-1') => ({ user: { id: userId }, access_token: token });
try {
  for (const platform of ['android', 'ios', 'web']) {
    const page = await browser.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<div id="root"></div>'); await page.evaluate(value => { globalThis.__platform = value; }, platform);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.waitForFunction(() => globalThis.__qa?.emit);
    const emit = async (event, nextSession) => page.evaluate(([event, nextSession]) => globalThis.__qa.emit(event, nextSession), [event, nextSession]);
    const requestCount = () => page.evaluate(() => globalThis.__qa.requests.length);
    async function nextRequest(action) {
      const count = await requestCount(); await action();
      await page.waitForFunction(count => globalThis.__qa.requests.length > count, count); return count;
    }
    const resolveRequest = (index, value = identity()) => page.evaluate(([index, value]) => globalThis.__qa.requests[index].resolve(value), [index, value]);
    const rejectRequest = (index, status) => page.evaluate(([index, status]) => globalThis.__qa.requests[index].reject(new globalThis.__qa.AuthApiError(status)), [index, status]);
    const waitStatus = status => page.waitForFunction(status => globalThis.__qa.auth.status === status, status);
    let index = await nextRequest(() => emit('INITIAL_SESSION', session()));
    await waitStatus('loading'); assert.equal(await page.locator('input').count(), 0);
    await rejectRequest(index, 503); await waitStatus('error'); assert.equal(await page.locator('input').count(), 0);
    index = await nextRequest(() => page.evaluate(() => globalThis.__qa.auth.refreshIdentity()));
    await waitStatus('loading'); await resolveRequest(index); await waitStatus('ready');
    await page.locator('input').fill('Borrador'); await page.getByRole('button', { name: 'Continuar' }).click();
    index = await nextRequest(() => page.evaluate(() => {
      for (const state of ['inactive', 'background', 'active']) globalThis.__qa.activate(state);
    }));
    if (baseline) {
      await waitStatus('loading'); assert.equal(await page.locator('input').count(), 0);
      console.log(`Baseline ${baseline} reproduce pérdida del formulario al volver a active.`); break;
    }
    async function preserved() {
      await waitStatus('ready'); assert.equal(await page.locator('input').inputValue(), 'Borrador');
      assert.equal(await page.locator('#step').textContent(), '2');
    }
    await preserved(); await resolveRequest(index); await preserved();
    const counters = await page.evaluate(() => [globalThis.__qa.starts, globalThis.__qa.stops]);
    assert.deepEqual(counters, platform === 'web' ? [0, 0] : [2, 2]);
    index = await nextRequest(() => emit('TOKEN_REFRESHED', session('actor', 'token-2')));
    await preserved(); await rejectRequest(index, 503); await preserved();
    index = await nextRequest(() => emit('SIGNED_IN', session('actor', 'token-2')));
    await preserved(); await resolveRequest(index); await preserved();
    index = await nextRequest(() => page.evaluate(() => globalThis.__qa.auth.refreshIdentity()));
    await rejectRequest(index, 401); await waitStatus('signedOut'); assert.equal(await page.locator('input').count(), 0);
    index = await nextRequest(() => emit('SIGNED_IN', session())); await resolveRequest(index); await waitStatus('ready');
    await page.locator('input').fill('Otra cuenta no debe ver esto');
    const stale = await nextRequest(() => page.evaluate(() => globalThis.__qa.activate('active')));
    index = await nextRequest(() => emit('SIGNED_IN', session('peer'))); await waitStatus('loading');
    assert.equal(await page.evaluate(index => globalThis.__qa.requests[index].signal.aborted, stale), true);
    await resolveRequest(stale); await waitStatus('loading');
    await resolveRequest(index, identity('peer')); await waitStatus('ready'); assert.equal(await page.locator('input').inputValue(), '');
    index = await nextRequest(() => page.evaluate(() => globalThis.__qa.activate('active')));
    await resolveRequest(index, identity('peer', 'other-campus')); await waitStatus('ready');
    index = await nextRequest(() => page.evaluate(() => globalThis.__qa.activate('active')));
    await resolveRequest(index, identity('wrong-uuid')); await waitStatus('forbidden');
    index = await nextRequest(() => page.evaluate(() => globalThis.__qa.auth.refreshIdentity())); await resolveRequest(index, identity('peer')); await waitStatus('ready');
    index = await nextRequest(() => page.evaluate(() => globalThis.__qa.activate('active')));
    await rejectRequest(index, 403); await waitStatus('forbidden');
    for (const code of ['ACCOUNT_SUSPENDED', 'ACCOUNT_DEACTIVATED', 'REGISTRATION_REQUIRED', 'FORBIDDEN']) {
      index = await nextRequest(() => page.evaluate(() => globalThis.__qa.auth.refreshIdentity()));
      await page.evaluate(([index, code]) => globalThis.__qa.requests[index].reject(new globalThis.__qa.AuthApiError(403, undefined, code)), [index, code]);
      await waitStatus('forbidden');
      assert.equal(await page.evaluate(() => globalThis.__qa.auth.denialCode), code);
      const count = await requestCount();
      for (let repeat = 0; repeat < 3; repeat++) {
        await emit('TOKEN_REFRESHED', session('peer', 'token-' + repeat));
        await emit('SIGNED_IN', session('peer', 'token-' + repeat));
        await page.evaluate(() => { globalThis.__qa.activate('background'); globalThis.__qa.activate('active'); });
      }
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await requestCount(), count, 'Blocked accounts must not revalidate automatically');
      await waitStatus('forbidden');
      assert.equal(await page.locator('input').count(), 0);
    }
    index = await nextRequest(() => emit('SIGNED_IN', session('another-account')));
    await resolveRequest(index, identity('another-account')); await waitStatus('ready');
    await page.evaluate(() => globalThis.__qa.auth.signOut()); await waitStatus('signedOut');
    assert.equal(await page.evaluate(() => globalThis.__qa.signOutScope), 'local');
    await page.evaluate(() => globalThis.__qa.unmount());
    assert.equal(await page.evaluate(() => globalThis.__qa.unsubscribed && globalThis.__qa.removed), true);
    assert.deepEqual(errors, []); await page.close();
    console.log(`${platform}: restauración, AppState, token, paso/borrador, 503, 401/403, UUID/cuenta/campus y cleanup aprobados.`);
  }
} finally { await browser.close(); }
