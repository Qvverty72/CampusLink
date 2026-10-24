import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import ts from 'typescript';

class AuthApiError extends Error { constructor(status) { super(); this.status = status; } }
function load(sourcePath, dependencies) {
  const source = fs.readFileSync(new URL(sourcePath, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, setTimeout, clearTimeout, console,
    AbortController, require: name => { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; } });
  return module.exports;
}

// Ejecuta los hooks reales con estado/refs y dependencias de efectos persistentes entre renders.
function hookHarness(path, name, dependencies) {
  const slots = []; let cursor = 0, effects = [];
  const react = {
    useCallback(fn) { return fn; },
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        effects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: effect() }; });
      }
    },
  };
  const debounce = load('../src/features/marketplace/hooks/useDebouncedValue.ts', { react });
  const hook = load(path, { ...dependencies, react, '../../hooks/useDebouncedValue': debounce })[name];
  return {
    render() { cursor = 0; const result = hook(); const pending = effects; effects = []; pending.forEach(effect => effect()); return result; },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test('resource telemetry retries an uncertain reply with the same opening key and stops after a second failure', async () => {
  const calls = [];
  const { recordResourceOpening } = load('../src/features/marketplace/api/resourceInteractions.ts', {
    '@/lib/api/operation-id': { operationId: () => 'opening-key' },
    '@/lib/api/authenticated-request': { AuthApiError, authenticatedRequest: async (path, init) => {
      calls.push({ path, body: init.body }); throw new AuthApiError(503);
    } },
  });
  await recordResourceOpening('resource-id');
  assert.equal(calls.length, 2); assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(JSON.parse(calls[0].body), { operationId: 'opening-key' });
});

test('digital list refreshes and failed details never count; each successful explicit opening counts once', async () => {
  const views = []; let fail = false;
  const harness = hookHarness('../src/features/marketplace/elibrary/hooks/useDigitalLibrary.ts', 'useDigitalLibrary', {
    '@/features/auth/hooks/useAuth': { useAuth: () => ({ refreshIdentity() {} }) },
    '@/lib/api/authenticated-request': { AuthApiError },
    '../../api/resourceInteractions': { recordResourceOpening: async id => { views.push(id); } },
    '../api/elibraryApi': { searchDigitalPublications: async () => ({ data: [], meta: { hasMore: false } }),
      loadDigitalAcademicCatalog: async () => ({}), loadDigitalPublication: async id => { if (fail) throw new Error('unavailable'); return { id }; } },
    '../api/documentPicker': { releaseDigitalFile() {} }, '../api/saveDigitalFile': {},
  });
  try {
    let library = harness.render(); await setImmediate(); library = harness.render(); assert.equal(views.length, 0);
    await library.openDetail('a'); library = harness.render(); assert.deepEqual(views, ['a']);
    library.reload(); harness.render(); await setImmediate(); library = harness.render(); assert.deepEqual(views, ['a']);
    await library.openDetail('a'); library = harness.render(); assert.deepEqual(views, ['a', 'a']);
    fail = true; await library.openDetail('b'); harness.render(); assert.deepEqual(views, ['a', 'a']);
  } finally { harness.dispose(); }
});

test('physical gallery refreshes preserve the opening key and reopening creates one new view', async () => {
  const views = []; let serial = 0;
  const harness = hookHarness('../src/features/marketplace/physicalgoods/hooks/usePhysicalgoodsResources.ts', 'usePhysicalgoodsResources', {
    '@/features/auth/hooks/useAuth': { useAuth: () => ({ refreshIdentity() {} }) },
    '@/lib/api/authenticated-request': { AuthApiError },
    '@/lib/api/operation-id': { operationId: () => `opening-${++serial}` },
    '../../api/resourceInteractions': { recordResourceOpening: async (id, key) => { views.push({ id, key }); } },
    '../api/physicalgoodsApi': { loadPublicationOptions: async () => ({}), loadPhysicalgoodsResources: async () => ({ data: [] }),
      loadPhysicalgoodsGallery: async id => ({ id, category: { id: 'category' }, images: [] }) },
    '../api/photoPicker': {}, '../types/publication': { emptyPhysicalgoodsFilters: {}, PHYSICALGOODS_MAX_IMAGES: 5 },
  });
  try {
    let resources = harness.render(); await setImmediate(); resources = harness.render(); assert.equal(views.length, 0);
    resources.open('a'); harness.render(); await setImmediate(); resources = harness.render();
    assert.deepEqual(views, [{ id: 'a', key: 'opening-1' }]);
    resources.reloadGallery(); harness.render(); await setImmediate(); resources = harness.render(); assert.equal(views.length, 1);
    resources.close(); resources = harness.render(); resources.open('a'); harness.render(); await setImmediate(); harness.render();
    assert.deepEqual(views, [{ id: 'a', key: 'opening-1' }, { id: 'a', key: 'opening-2' }]);
  } finally { harness.dispose(); }
});
