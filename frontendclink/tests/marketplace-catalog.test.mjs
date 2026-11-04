import { loadSafeArea } from './helpers/safe-area.mjs';
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
    if (name === '@/lib/layout/safeArea') return loadSafeArea(dependencies['react-native']?.Platform?.OS); assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`); return dependencies[name];
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
function fixture(kind,catalogActive=true) {
  const h = runtime(), calls = [], details = [],optionReads=[];
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
      '../api/physicalgoodsApi': { loadPublicationOptions: async () => {optionReads.push(true);return { categories: [], careers: [], subjects: [] };}, loadPhysicalgoodsResources: capture,
        loadPhysicalgoodsGallery:(id,signal)=>new Promise((resolve,reject)=>details.push({id,signal,resolve,reject})) },
    }, h.globals));
  } else {
    ({ useDigitalLibrary: hook } = load('elibrary/hooks/useDigitalLibrary.ts', { ...shared,
      '../api/documentPicker': { releaseDigitalFile() {} }, '../api/saveDigitalFile': {},
      '../api/elibraryApi': { searchDigitalPublications: capture, loadDigitalAcademicCatalog: async () => ({ careers: [], subjects: [] }),
        loadDigitalPublication: (id, signal) => new Promise(resolve => details.push({ id, signal, resolve })) },
    }, h.globals));
  }
  let state;
  return { h, calls, details,optionReads, render() { for (let i = 0; i < 3; i++) state = h.render(()=>hook(catalogActive)); return state; } };
}

test('physical: standalone administration loads options and the chosen gallery without exploring the catalog',async()=>{
 const f=fixture('physical',false);f.render();await setImmediate();let state=f.render();
 assert.equal(f.calls.length,0);assert.equal(f.optionReads.length,1);assert.equal(state.loading,false);
 state.open('mine');f.render();assert.equal(f.details.length,1);assert.equal(f.details[0].id,'mine');
 f.details[0].resolve({id:'mine',category:{id:'books'},images:[],canEdit:true});await setImmediate();state=f.render();
 assert.equal(state.gallery.id,'mine');assert.equal(f.calls.length,0);f.h.unmount();assert.equal(f.details[0].signal.aborted,true);
});

test('physical: automatic renewal keeps the loaded page, reconciles changes and discards a stale background response',async()=>{
 const f=fixture('physical');let state=f.render();f.calls[0].resolve({data:[],meta:{hasMore:true}});await setImmediate();state=f.render();state.setNumber(2);state=f.render();
 const same={id:'same',imageUrl:'signed',price:5000},changed={id:'changed',imageUrl:null,price:1000};
 f.calls.at(-1).resolve({data:[same,changed,{id:'removed',imageUrl:null}],meta:{hasMore:true}});await setImmediate();state=f.render();const before=state.page;
 f.h.tick(50000);state=f.render();assert.equal(state.loading,false);assert.equal(state.page,before);assert.equal(f.calls.at(-1).page,2);assert.equal(f.optionReads.length,2);
 f.calls.at(-1).reject(new Error('offline'));await setImmediate();state=f.render();assert.equal(state.page,before);assert.equal(state.error,null);
 f.h.tick(50000);state=f.render();f.calls.at(-1).resolve({data:[{...same},{...changed,price:8000},{id:'new',imageUrl:null}],meta:{hasMore:false}});await setImmediate();state=f.render();
 assert.equal(state.loading,false);assert.equal(state.number,2);assert.equal(state.page.data[0],same);assert.equal(state.page.data[1].price,8000);assert.deepEqual(Array.from(state.page.data,row=>row.id),['same','changed','new']);
 const stable=state.page;f.h.tick(50000);f.calls.at(-1).resolve(JSON.parse(JSON.stringify(stable)));await setImmediate();state=f.render();assert.equal(state.page,stable);
 f.h.tick(50000);const stale=f.calls.at(-1);state.setFilter('q','nuevo');state=f.render();f.h.tick(300);state=f.render();assert.equal(stale.signal.aborted,true);
 stale.resolve(before);f.calls.at(-1).resolve({data:[{id:'filtered',imageUrl:null}],meta:{hasMore:false}});await setImmediate();state=f.render();assert.equal(state.page.data[0].id,'filtered');assert.equal(state.number,1);assert.equal(f.h.timers.size,0);f.h.unmount();
});

test('physical: gallery renewal preserves content and edits, updates current state and stops after close',async()=>{
 const f=fixture('physical');let state=f.render();f.calls[0].resolve({data:[],meta:{hasMore:false}});await setImmediate();state=f.render();state.open('resource');state=f.render();
 const gallery={id:'resource',title:'Recurso',category:{id:'books'},images:[{id:'photo',url:'old'}],status:'DISPONIBLE',acceptsRequests:true};
 f.details[0].resolve(gallery);await setImmediate();state=f.render();state.setEditCategory('draft');state=f.render();
 f.h.tick(50000);state=f.render();assert.equal(state.galleryLoading,false);assert.equal(state.gallery,gallery);assert.equal(state.editCategory,'draft');
 f.details.at(-1).reject(new Error('offline'));await setImmediate();state=f.render();assert.equal(state.gallery,gallery);assert.equal(state.galleryError,null);
 f.h.tick(50000);f.details.at(-1).resolve({...gallery,status:'RESERVADO',acceptsRequests:false,images:[{id:'photo',url:'renewed'}]});await setImmediate();state=f.render();
 assert.equal(state.galleryLoading,false);assert.equal(state.gallery.status,'RESERVADO');assert.equal(state.gallery.acceptsRequests,false);assert.equal(state.gallery.images[0].url,'renewed');assert.equal(state.editCategory,'draft');
 f.h.tick(50000);const stale=f.details.at(-1);state.close();state=f.render();assert.equal(stale.signal.aborted,true);stale.resolve(gallery);await setImmediate();state=f.render();assert.equal(state.gallery,null);assert.equal(f.h.timers.size,0);f.h.unmount();
});

test('physical: background authorization loss and removed detail clear stale data instead of retrying silently',async()=>{
 for(const status of [401,403,404]){
  const f=fixture('physical');let state=f.render();f.calls[0].resolve({data:[{id:'resource',imageUrl:'signed'}],meta:{hasMore:false}});await setImmediate();state=f.render();
  if(status===404){state.open('resource');state=f.render();f.details[0].resolve({id:'resource',category:{id:'books'},images:[]});await setImmediate();state=f.render();}
  f.h.tick(50000);const reason=new AuthApiError('not available');reason.status=status;
  (status===404?f.details:f.calls).at(-1).reject(reason);await setImmediate();state=f.render();assert.equal(status===404?state.gallery:state.page,null);
  if(status===404){assert.match(state.galleryError,/operación/);f.calls.at(-1).resolve({data:[],meta:{hasMore:false}});await setImmediate();f.render();}
  assert.equal(f.h.timers.size,0);f.h.unmount();
 }
});

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
    const components = { SearchInput: 'Search', FilterChips: 'Chips', FilterSheet: 'Sheet', FilterOptions: 'Options', ui: {}, CATALOG_COLORS: {} };
    const shared = { react: h.react, 'react/jsx-runtime': jsx, 'react-native': { View: 'View', Text: 'Text', TextInput: 'Input', Pressable: 'Button', ScrollView: 'Scroll', Switch: 'Switch', StyleSheet: { create: value => value } }, '../../components/CatalogUI': components, '../../components/AcademicFilterFields': { AcademicFilterFields: 'Academic' } };
    let render;
    shared['../utils/orderPhysicalgoodsCategories']=load('physicalgoods/utils/orderPhysicalgoodsCategories.ts',{});
    if (kind === 'physical') {
      const { PhysicalgoodsSearchFilters } = load('physicalgoods/components/PhysicalgoodsSearchFilters.tsx', { ...shared, '../types/publication': { resourceConditions: [{ value: 'NUEVO', label: 'Nuevo' }, { value: 'BUEN_ESTADO', label: 'Buen estado' }, { value: 'USADO', label: 'Usado' }, { value: 'DETERIORADO', label: 'Deteriorado' }] } });
      const resources = { filters: { ...emptyPhysicalgoodsFilters, categoryId: 'books' }, options: { categories: [{ id:'other',name:'Otros' },{ id: 'books', name: 'Libros' },{id:'tech',name:'Tecnología'}], careers: [], subjects: [] }, setFilter: (...args) => changes.push(args) };
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
    assert.equal(nodes.find(node => node.type === 'Sheet').props.fillHeight, true);
    assert.equal(nodes.find(node => node.type === 'Sheet').props.compact, true);
    assert.equal(nodes.find(node => node.type === 'Sheet').props.preferredHeight, kind === 'physical' ? 680 : 480);
    let academic = nodes.find(node => node.type === 'Academic'); assert.equal(academic.props.openField, null);
    academic.props.onOpenFieldChange('careerId'); nodes = elements(h.render(render));
    academic = nodes.find(node => node.type === 'Academic'); assert.equal(academic.props.openField, 'careerId');
    academic.props.onOpenFieldChange('subjectId'); nodes = elements(h.render(render));
    academic = nodes.find(node => node.type === 'Academic'); assert.equal(academic.props.openField, 'subjectId');
    academic.props.onChange('subjectId', 'subject');
    if (kind === 'physical') {
      assert.deepEqual(changes.at(-1), ['subjectId', 'subject']);
      for (const [label, id] of [['Nuevo','NUEVO'],['Buen estado','BUEN_ESTADO'],['Usado','USADO'],['Deteriorado','DETERIORADO'],['Todas','']]) {
        nodes.find(node => node.props?.accessibilityLabel === `Condición: ${label}`).props.onPress();
        if (id) assert.deepEqual(changes.at(-1), ['condition', id]);
      }
      nodes.find(node => node.props?.accessibilityLabel === 'Categoría: Todas').props.onPress();
      assert.deepEqual(changes.at(-1), ['categoryId', '']);
      const before = changes.length;
      nodes.find(node => node.props?.accessibilityLabel === 'Categoría: Libros').props.onPress();
      assert.equal(changes.length, before, 'Repetir la selección no consulta');
      nodes.find(node => node.props?.accessibilityLabel === 'Precio mínimo').props.onChangeText('1000');
      assert.deepEqual(changes.at(-1), ['minPrice','1000']);
      nodes.find(node => node.props?.accessibilityLabel === 'Precio máximo').props.onChangeText('5000');
      assert.deepEqual(changes.at(-1), ['maxPrice','5000']);
      assert.equal(nodes.some(node=>node.type==='Switch'),false);
      assert.deepEqual(nodes.filter(node=>node.props?.accessibilityLabel?.startsWith('Categoría:')).map(node=>node.props.accessibilityLabel),['Categoría: Todas','Categoría: Libros','Categoría: Tecnología','Categoría: Otros']);
    } else { assert.equal(changes.at(-1).subjectId, 'subject'); assert.equal(changes.at(-1).careerId, 'career'); }
    nodes.find(node => node.type === 'Sheet').props.onClose(); nodes = elements(h.render(render));
    assert.equal(nodes.find(node => node.type === 'Sheet').props.visible, false);
    assert.equal(nodes.find(node => node.type === 'Academic').props.openField, null);
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

test('grupo académico comparte búsqueda requerida y conserva IDs, apertura y estado de carga', () => {
  const { AcademicFilterFields } = load('components/AcademicFilterFields.tsx', {
    'react/jsx-runtime': jsx, 'react-native': { View: 'View', Text: 'Text' },
    './CatalogUI': { ui: {} }, './SearchableFilterSelect': { SearchableFilterSelect: 'Options' },
  });
  const changes = [], openings = [], careers = [{ id: 'career', name: 'Informática' }];
  const nodes = elements(AcademicFilterFields({ careers, subjects: [], careerId: 'career', subjectId: '', openField: 'careerId',
    onChange: (...args) => changes.push(args), onOpenFieldChange: value => openings.push(value), disabled: true, loading: true }));
  const selects = nodes.filter(node => node.type === 'Options');
  assert.equal(selects.length, 2); assert.equal(selects[0].props.options, careers);
  assert.equal(selects[0].props.value, 'career'); assert.equal(selects[0].props.expanded, true); assert.equal(selects[1].props.expanded, false);
  for (const select of selects) { assert.equal(select.props.searchRequired, true); assert.equal(select.props.showLabel, false);
    assert.equal(select.props.placeholder, select.props.label); assert.equal(select.props.disabled, true); assert.equal(select.props.loading, true); }
  selects[1].props.onExpandedChange(true); selects[1].props.onChange('subject'); selects[0].props.onExpandedChange(false);
  assert.deepEqual(openings, ['subjectId', null]); assert.deepEqual(changes, [['subjectId', 'subject']]);
});
