import { loadSafeArea } from './helpers/safe-area.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

function load(file, deps) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(new URL('../src/features/marketplace/' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, AbortController, require(name) {
    if (name === '@/lib/layout/safeArea') return loadSafeArea(deps['react-native']?.Platform?.OS); assert.ok(Object.hasOwn(deps, name), name); return deps[name];
  } });
  return module.exports;
}
function runtime() {
  const slots = []; let index = 0, effects = [];
  const react = {
    useState(initial) { const i = index++; if (!(i in slots)) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }]; },
    useRef(initial) { const i = index++; return slots[i] ??= { current: initial }; },
    useEffect(fn, deps) { const i = index++, old = slots[i]; if (!old || deps.some((value, j) => !Object.is(value, old.deps[j]))) effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
    useCallback(fn, deps) { const i = index++, old = slots[i]; if (!old || deps.some((value, j) => !Object.is(value, old.deps[j]))) slots[i] = { fn, deps }; return slots[i].fn; },
  };
  return { react, render(fn) { index = 0; effects = []; const result = fn(); effects.forEach(effect => effect()); return result; }, unmount() { slots.forEach(slot => slot?.cleanup?.()); } };
}
const elements = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(4).flatMap(elements)];
const noop = () => {};
const components = Object.fromEntries(['AgreementNotice', 'DetailActionBar', 'DetailHeader', 'DetailSection', 'OwnerCard', 'RequestMessageForm', 'RequestResourceSummary', 'ResourceDetailSkeleton', 'ResourcePrice'].map(name => [name, name]));
components.detailUI = {};
const native = { View: 'View', Text: 'Text', Pressable: 'Button', ScrollView: 'Scroll', Image: 'Image', StyleSheet: { create: value => value } };
const catalogUI = { CATALOG_COLORS: {}, ui: {}, FilterOptions: 'Options', PriceTag: 'Price', StatusTag: 'Status' };
const baseUI = h => ({ react: h.react, 'react/jsx-runtime': jsx, 'react-native': native,
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
  '../../components/PersonalUI': { PersonalStatus: 'Status' }, '../../components/RequestFlowUI': { RequestSentConfirmation: 'Sent' },
  '../../components/CatalogUI': catalogUI, '../../components/ResourceDetailUI': components,
  '../../components/MarketplaceReportForm': { MarketplaceReportForm: 'Report' },
});

test('physical detail blocks own/reserved requests, routes the existing request, and opens the message form before sending', async () => {
  const h = runtime(), opened = []; let sent = 0, reloaded = 0;
  const request = { options: { canRequest: true, messages: [{ code: 'INTERES', label: 'Me interesa' }], activeRequest: null }, loading: false, busy: false,
    messageCode: '', send: async () => sent++, reload: noop, setMessageCode: noop };
  const resources = { gallery: { id: 'resource', title: 'Calculadora', images: [], owner: { id: 'owner', fullName: 'Camila' }, category: { name: 'Ciencias' }, status: 'DISPONIBLE', acceptsRequests: true }, reloadGallery: () => reloaded++ };
  const { PhysicalgoodsDetail } = load('physicalgoods/components/PhysicalgoodsDetail.tsx', { ...baseUI(h),
    'lucide-react-native': { ImageIcon: 'Icon' }, '@/features/auth/hooks/useAuth': { useAuth: () => ({ identity: { userId: 'reader' } }) },
    '../hooks/useRequestPhysicalgoods': { useRequestPhysicalgoods: () => request }, '../types/publication': { resourceConditions: [], PHYSICALGOODS_MAX_IMAGES: 3 },
    './PhysicalgoodsManagement': { PhysicalgoodsManagement: 'Management' },
    './PhysicalgoodsPriceHistory':{PhysicalgoodsOriginalPrice:'OriginalPrice'},
  });
  const render = () => elements(h.render(() => PhysicalgoodsDetail({ resources, onClose: noop, onBusyChange: noop, onRequestDetail: (...args) => opened.push(args) })));
  let nodes = render(), footer = nodes.find(node => node.type === 'DetailActionBar');
  assert.equal(footer.props.disabled, false); assert.equal(footer.props.label, 'Solicitar este recurso');
  footer.props.onPress(); assert.equal(sent, 0); nodes = render();
  assert.ok(nodes.some(node => node.type === 'RequestMessageForm')); assert.equal(nodes.find(node => node.type === 'DetailActionBar').props.disabled, true);
  request.messageCode = 'INTERES'; nodes = render(); nodes.find(node => node.type === 'DetailActionBar').props.onPress(); await setImmediate(); assert.equal(sent, 1); assert.equal(reloaded, 1);
  resources.gallery.status = 'RESERVADO'; resources.gallery.acceptsRequests = false; nodes = render(); assert.equal(nodes.find(node => node.type === 'DetailActionBar').props.disabled, true);
  request.options.activeRequest = { id: 'my-request', status: 'PENDIENTE' }; nodes = render(); footer = nodes.find(node => node.type === 'DetailActionBar');
  assert.equal(footer.props.label, 'Ver mi solicitud'); assert.equal(footer.props.disabled, false); footer.props.onPress(); assert.deepEqual(opened, [['resource', 'my-request']]);
  resources.gallery.owner.id = 'reader'; nodes = render(); assert.equal(nodes.find(node => node.type === 'DetailActionBar').props.disabled, true);
  assert.match(nodes.find(node => node.type === 'DetailActionBar').props.helper, /propia publicación/);
  resources.gallery.canEdit=true;nodes.find(node=>node.type==='DetailHeader').props.onBack();nodes=render();nodes.find(node=>node.type==='Button'&&elements(node).some(child=>child.type==='Text'&&child.props.children==='Administrar publicación')).props.onPress();nodes=render();assert.ok(nodes.some(node=>node.type==='Management'));assert.ok(!nodes.some(node=>node.type==='DetailActionBar'));nodes.find(node=>node.type==='Management').props.onClose();assert.ok(!render().some(node=>node.type==='Management'));h.unmount();
});

test('digital detail uses protected preview, blocks own requests and opens the acquired resource instead of another request', () => {
  const h = runtime(), acquired = []; let requests = 0;
  const resource = { id: 'digital', title: 'Guía', status: 'DISPONIBLE', acquired: false, careers: [], subjects: [], files: [{ id: 'file', name: 'guia.pdf', sizeBytes: 1024 }] };
  const library = { detail: resource, isOwner: false }, request = { options: { canRequest: true }, loading: false };
  const { DigitalResourceDetail } = load('elibrary/components/DigitalResourceDetail.tsx', { ...baseUI(h),
    'lucide-react-native': { FileText: 'Icon', LockKeyhole: 'Icon' }, '@/components/navigation/BottomNavigationBar': { BottomNavigationBar: 'Nav' },
    '../hooks/useDigitalTrades': { useDigitalRequestAction: () => request }, './DigitalPreview': { DigitalPreview: 'Preview' },
    './DigitalAcademicSelector': { DigitalAcademicSelector: 'Academic' }, './DigitalPublicationEditor': { DigitalPublicationEditor: 'Editor' },
  });
  const render = () => elements(h.render(() => DigitalResourceDetail({ library, onAcquired: id => acquired.push(id), onRequests: () => requests++ })));
  let nodes = render(); const preview = nodes.find(node => node.type === 'Preview');
  assert.equal(preview.props.autoOpen, true); assert.equal(preview.props.fileId, 'file');
  assert.equal(nodes.find(node => node.type === 'DetailActionBar').props.label, 'Solicitar este recurso');
  resource.acquired = true; nodes = render(); let footer = nodes.find(node => node.type === 'DetailActionBar');
  assert.equal(footer.props.label, 'Abrir en mis materiales'); footer.props.onPress(); assert.deepEqual(acquired, ['digital']);
  resource.acquired = false; request.options.activeRequestId = 'request'; nodes = render(); nodes.find(node => node.type === 'DetailActionBar').props.onPress(); assert.equal(requests, 1);
  library.isOwner = true; nodes = render(); assert.equal(nodes.find(node => node.type === 'DetailActionBar').props.disabled, true); h.unmount();
});

test('automatic digital preview cancels changed files and never restores an obsolete fragment or downloads originals', async () => {
  const h = runtime(), calls = []; let fileId = 'first';
  const { useDigitalPreview } = load('elibrary/hooks/useDigitalPreview.ts', { react: h.react, '../api/elibraryApi': {
    loadDigitalPreview: (id, file, signal) => new Promise(resolve => calls.push({ id, file, signal, resolve })),
  } });
  const render = () => h.render(() => useDigitalPreview('resource', fileId, true));
  render(); assert.equal(calls.length, 1); fileId = 'second'; render(); assert.equal(calls[0].signal.aborted, true);
  calls[1].resolve({ available: false, text: null, message: 'Sin vista previa' }); await setImmediate(); let state = render();
  assert.equal(state.result.available, false); calls[0].resolve({ available: true, text: 'Obsoleto' }); await setImmediate(); state = render();
  assert.equal(state.result.message, 'Sin vista previa'); state.show(); h.unmount(); assert.equal(calls.at(-1).signal.aborted, true);
});

class AuthApiError extends Error {}
test('digital requests require a current allowed message, serialize writes and preserve the error after an uncertain reply', async () => {
  const h = runtime(), writes = [], reads = [];
  const { useDigitalRequestAction } = load('elibrary/hooks/useDigitalTrades.ts', { react: h.react,
    '@/lib/api/authenticated-request': { AuthApiError }, '@/features/auth/hooks/useAuth':{useAuth:()=>({identity:{userId:'viewer'}})}, '@/lib/api/operation-id': { operationId: () => 'operation' },
    '../api/digitalTradesApi': { loadDigitalRequestOptions: (id, signal) => new Promise(resolve => reads.push({ resolve, signal })),
      requestDigitalResource: (...args) => new Promise((resolve, reject) => writes.push({ args, resolve, reject })) },
  });
  const render = () => h.render(() => useDigitalRequestAction('resource'));
  let state = render(); state.setCode('arbitrary'); state = render(); await state.submit(); assert.equal(writes.length, 0);
  reads[0].resolve({ canRequest: true, messages: [{ code: 'INTERES' }] }); await setImmediate(); state = render(); await state.submit(); assert.equal(writes.length, 0);
  state.setCode('INTERES'); state = render(); const pending = state.submit(); state.submit(); assert.equal(writes.length, 1);
  writes[0].reject(new TypeError('network')); await pending; state = render();
  reads[1].resolve({ canRequest: true, messages: [{ code: 'INTERES' }] }); await setImmediate(); state = render();
  assert.match(state.error, /actualiza el estado/); assert.equal(writes.length, 1, 'Nunca reintentar un POST automáticamente'); h.unmount();
});

test('opening acquired material directly keeps the loading state until list and authorized detail finish independently', async () => {
  const h = runtime(); let list, detail;
  const { useAcquiredDigitalResources } = load('elibrary/hooks/useAcquiredDigitalResources.ts', { react: h.react,
    '../api/elibraryApi': { loadAcquiredDigitalResources: () => new Promise(resolve => { list = resolve; }), loadAcquiredDigitalResource: () => new Promise(resolve => { detail = resolve; }) }, '../api/saveDigitalFile': {},
  });
  const render = () => h.render(() => useAcquiredDigitalResources(true));
  let state = render(); const opening = state.show('acquired-id'); render(); list({ data: [], meta: { hasMore: false } }); await setImmediate(); state = render();
  assert.equal(state.loading, true, 'La carga de lista no debe ocultar la espera del detalle'); detail({ id: 'acquired-id', files: [] }); await opening; state = render();
  assert.equal(state.loading, false); assert.equal(state.detail.id, 'acquired-id'); h.unmount();
});

test('detalle digital reconsulta recurso tras envío confirmado y conserva fallo sin recargar formulario',async()=>{
 const h=runtime(),reloaded=[];let success=false;
 const resource={id:'digital',title:'Guía',status:'DISPONIBLE',careers:[],subjects:[],files:[]};
 const library={detail:resource,isOwner:false,openDetail:id=>reloaded.push(id)},request={options:{canRequest:true,messages:[]},loading:false,code:'INTERES',submit:async()=>success};
 const {DigitalResourceDetail}=load('elibrary/components/DigitalResourceDetail.tsx',{...baseUI(h),'lucide-react-native':{FileText:'Icon',LockKeyhole:'Icon'},'@/components/navigation/BottomNavigationBar':{BottomNavigationBar:'Nav'},'../hooks/useDigitalTrades':{useDigitalRequestAction:()=>request},'./DigitalPreview':{DigitalPreview:'Preview'},'./DigitalAcademicSelector':{DigitalAcademicSelector:'Academic'},'./DigitalPublicationEditor':{DigitalPublicationEditor:'Editor'}});
 const render=()=>elements(h.render(()=>DigitalResourceDetail({library,onAcquired:noop,onRequests:noop})));let tree=render();tree.find(node=>node.type==='DetailActionBar').props.onPress();tree=render();tree.find(node=>node.type==='DetailActionBar').props.onPress();await setImmediate();assert.deepEqual(reloaded,[]);
 success=true;tree.find(node=>node.type==='DetailActionBar').props.onPress();await setImmediate();assert.deepEqual(reloaded,['digital']);h.unmount();
});
