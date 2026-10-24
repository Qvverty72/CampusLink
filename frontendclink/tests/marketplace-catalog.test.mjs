import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

function load(file, dependencies, globals = {}) {
  const source = fs.readFileSync(new URL('../src/features/marketplace/' + file, import.meta.url), 'utf8');
  const module = { exports: {} };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, AbortController, ...globals, require(name) {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`); return dependencies[name];
  } });
  return module.exports;
}
function runtime() {
  const slots = [], timers = new Map(); let cursor = 0, effects = [], clock = 0, next = 0;
  const react = {
    useCallback(fn) { return fn; },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useEffect(fn, deps) { const i = cursor++, old = slots[i];
      if (!old || deps.some((value, j) => !Object.is(value, old.deps[j]))) effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  const globals = { setTimeout(fn, delay) { const id = ++next; timers.set(id, { fn, at: clock + delay }); return id; }, clearTimeout(id) { timers.delete(id); } };
  return { react, globals, render(fn) { cursor = 0; effects = []; const value = fn(); effects.forEach(effect => effect()); return value; },
    tick(ms) { clock += ms; for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.fn(); } },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); }, timers,
  };
}
class AuthApiError extends Error {}
const auth = { identity: { userId: 'owner', campusId: 'campus' }, refreshIdentity() {} };
const emptyPhysicalgoodsFilters = { q: '', categoryId: '', modality: '', condition: '', careerId: '', subjectId: '', minPrice: '', maxPrice: '', mine: false };
function fixture(kind) {
  const h = runtime(), calls = [], details = [];
  const { useDebouncedValue } = load('hooks/useDebouncedValue.ts', { react: h.react }, h.globals);
  const shared = { react: h.react, '@/features/auth/hooks/useAuth': { useAuth: () => auth },
    '@/lib/api/authenticated-request': { AuthApiError }, '../../api/resourceInteractions': { recordResourceOpening() {} },
    '../../hooks/useDebouncedValue': { useDebouncedValue } };
  const capture = (filters, page, signal) => new Promise((resolve, reject) => calls.push({ filters, page, signal, resolve, reject }));
  let hook;
  if (kind === 'physical') {
    ({ usePhysicalgoodsResources: hook } = load('physicalgoods/hooks/usePhysicalgoodsResources.ts', { ...shared,
      '@/lib/api/operation-id': { operationId: () => 'operation' }, '../api/photoPicker': {},
      '../types/publication': { emptyPhysicalgoodsFilters, PHYSICALGOODS_MAX_IMAGES: 3 },
      '../api/physicalgoodsApi': { loadPublicationOptions: async () => ({ categories: [], careers: [], subjects: [] }), loadPhysicalgoodsResources: capture },
    }, h.globals));
  } else {
    ({ useDigitalLibrary: hook } = load('elibrary/hooks/useDigitalLibrary.ts', { ...shared,
      '../api/documentPicker': { releaseDigitalFile() {} }, '../api/saveDigitalFile': {},
      '../api/elibraryApi': { searchDigitalPublications: capture, loadDigitalAcademicCatalog: async () => ({ careers: [], subjects: [] }),
        loadDigitalPublication: (id, signal) => new Promise(resolve => details.push({ id, signal, resolve })) },
    }, h.globals));
  }
  let state;
  return { h, calls, details, render() { for (let i = 0; i < 3; i++) state = h.render(hook); return state; } };
}

for (const kind of ['physical', 'digital']) {
  test(`${kind}: escritura agrupada a 300 ms, reinicio de página y descarte de respuesta obsoleta`, async () => {
    const f = fixture(kind); let state = f.render();
    assert.equal(f.calls.length, 1);
    f.calls[0].resolve({ data: [], meta: { hasMore: true } }); await setImmediate(); state = f.render();
    if (kind === 'physical') state.setNumber(2); else state.nextPage();
    state = f.render(); assert.equal(f.calls.at(-1).page, 2);
    const stale = f.calls.at(-1);
    const type = q => { if (kind === 'physical') state.setFilter('q', q); else state.search({ ...state.filters, q }); state = f.render(); };
    type('ca'); f.h.tick(200); type('cálculo'); f.h.tick(299); state = f.render();
    assert.equal(f.calls.length, 2, 'No consultar por cada pulsación');
    f.h.tick(1); state = f.render();
    assert.equal(f.calls.length, 3); assert.equal(f.calls.at(-1).filters.q, 'cálculo'); assert.equal(f.calls.at(-1).page, 1);
    assert.equal(stale.signal.aborted, true);
    const row = { id: 'latest', imageUrl: null };
    f.calls.at(-1).resolve({ data: [row], meta: { hasMore: false } }); await setImmediate(); state = f.render();
    stale.resolve({ data: [{ id: 'stale' }], meta: { hasMore: true } }); await setImmediate(); state = f.render();
    assert.equal((kind === 'physical' ? state.page.data : state.items)[0].id, 'latest');
    f.h.unmount();
  });
}

test('physical: rango inválido no consulta; donación retira precios y reinicia la página', () => {
  const f = fixture('physical'); let state = f.render();
  state.setFilter('minPrice', '5000'); state = f.render(); state.setFilter('maxPrice', '1000'); state = f.render();
  f.h.tick(300); state = f.render();
  assert.equal(f.calls.length, 1); assert.match(state.error, /máximo/);
  state.setFilter('modality', 'DONACION'); state = f.render(); f.h.tick(300); state = f.render();
  assert.equal(state.filters.minPrice, ''); assert.equal(state.filters.maxPrice, '');
  assert.equal(f.calls.at(-1).filters.modality, 'DONACION'); assert.equal(f.calls.at(-1).filters.minPrice, '');
  state.clearFilters(); state = f.render(); assert.equal(state.number, 1); assert.equal(f.calls.at(-1).filters.modality, '');
  f.h.unmount();
});

const elements = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(4).flatMap(elements)];
for (const kind of ['physical', 'digital']) {
  test(`${kind}: controles de búsqueda, modalidad, sheet y chips conservan IDs y permiten quitar filtros`, () => {
    const h = runtime(), changes = [];
    const components = { SearchInput: 'Search', FilterChips: 'Chips', FilterSheet: 'Sheet', FilterOptions: 'Options', ui: {} };
    const shared = { react: h.react, 'react/jsx-runtime': jsx, 'react-native': { View: 'View', Text: 'Text', TextInput: 'Input', Pressable: 'Button' }, '../../components/CatalogUI': components, '../../components/SearchableFilterSelect': { SearchableFilterSelect: 'Options' } };
    let render;
    if (kind === 'physical') {
      const { PhysicalgoodsSearchFilters } = load('physicalgoods/components/PhysicalgoodsSearchFilters.tsx', { ...shared, '../types/publication': { resourceConditions: [] } });
      const resources = { filters: { ...emptyPhysicalgoodsFilters, categoryId: 'books' }, options: { categories: [{ id: 'books', name: 'Libros' }], careers: [], subjects: [] }, setFilter: (...args) => changes.push(args) };
      render = () => PhysicalgoodsSearchFilters({ resources });
    } else {
      const { DigitalSearchForm } = load('elibrary/components/DigitalSearchForm.tsx', shared);
      render = () => DigitalSearchForm({ filters: { q: '', modality: '', careerId: 'career', subjectId: '' }, catalog: { careers: [{ id: 'career', name: 'Informática' }], subjects: [] }, onSearch: filters => changes.push(filters) });
    }
    let nodes = elements(h.render(render));
    assert.equal(nodes.find(node => node.type === 'Sheet').props.visible, false);
    nodes.find(node => node.type === 'Search').props.onChange('cálculo');
    nodes.find(node => node.type === 'Chips').props.onModality('VENTA');
    nodes.find(node => node.type === 'Chips').props.active[0].remove();
    if (kind === 'physical') assert.deepEqual(changes, [['q', 'cálculo'], ['modality', 'VENTA'], ['categoryId', '']]);
    else { assert.equal(changes[0].q, 'cálculo'); assert.equal(changes[1].modality, 'VENTA'); assert.equal(changes[2].careerId, ''); }
    nodes.find(node => node.type === 'Chips').props.onMore(); nodes = elements(h.render(render));
    assert.equal(nodes.find(node => node.type === 'Sheet').props.visible, true);
    let selects = nodes.filter(node => node.type === 'Options'); assert.ok(selects.every(node => !node.props.expanded));
    selects[0].props.onExpandedChange(true); nodes = elements(h.render(render)); selects = nodes.filter(node => node.type === 'Options'); assert.equal(selects.filter(node => node.props.expanded).length, 1);
    selects[1].props.onExpandedChange(true); nodes = elements(h.render(render)); selects = nodes.filter(node => node.type === 'Options'); assert.equal(selects[0].props.expanded, false); assert.equal(selects[1].props.expanded, true);
    nodes.find(node => node.type === 'Sheet').props.onClose(); nodes = elements(h.render(render));
    assert.equal(nodes.find(node => node.type === 'Sheet').props.visible, false); assert.ok(nodes.filter(node => node.type === 'Options').every(node => !node.props.expanded));
    h.unmount();
  });
}

test('digital: conserva filtros al abrir/cerrar detalle y cancela debounce al desmontar', async () => {
  const f = fixture('digital'); let state = f.render();
  state.search({ ...state.filters, careerId: 'career', modality: 'VENTA' }); state = f.render(); f.h.tick(300); state = f.render();
  const opening = state.openDetail('resource'); state = f.render();
  f.details[0].resolve({ id: 'resource', ownerId: 'someone' }); await opening; state = f.render();
  assert.equal(state.detail.id, 'resource'); state.closeDetail(); state = f.render();
  assert.equal(state.filters.careerId, 'career'); assert.equal(state.filters.modality, 'VENTA');
  state.search({ ...state.filters, q: 'pendiente' }); state = f.render();
  const before = f.calls.length; f.h.unmount(); f.h.tick(300);
  assert.equal(f.calls.length, before); assert.equal(f.calls.at(-1).signal.aborted, true);
});

for (const kind of ['physical','digital']) test(`${kind}: refrescar vuelve a página1 y conserva búsqueda/modalidad`,async()=>{
 const f=fixture(kind);let state=f.render();f.calls[0].resolve({data:[],meta:{hasMore:true}});await setImmediate();state=f.render();
 if(kind==='physical')state.setFilter('q','cálculo');else state.search({...state.filters,q:'cálculo',modality:'DONACION'});
 if(kind==='physical')state.setFilter('modality','DONACION');state=f.render();f.h.tick(300);state=f.render();f.calls.at(-1).resolve({data:[],meta:{hasMore:true}});await setImmediate();state=f.render();
 if(kind==='physical')state.setNumber(3);else state.nextPage();state=f.render();f.calls.at(-1).resolve({data:[],meta:{hasMore:true}});await setImmediate();state=f.render();state.refresh();state=f.render();
 assert.equal(f.calls.at(-1).page,1);assert.equal(f.calls.at(-1).filters.q,'cálculo');assert.equal(f.calls.at(-1).filters.modality,'DONACION');assert.equal(state.filters.q,'cálculo');f.h.unmount();
});
