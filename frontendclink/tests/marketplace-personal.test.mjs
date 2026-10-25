import { loadSafeArea } from './helpers/safe-area.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { renderCatalog } from './helpers/marketplace-render.mjs';

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

const native={View:'View',Text:'Text',Pressable:'Button',Modal:'Modal',Image:'Image',ActivityIndicator:'Spinner',StyleSheet:{create:value=>value}};
const activityUI=Object.fromEntries(['ActivityAction','ActivityCard','ActivityFeedback','ActivityHeader','ActivityPager','PublicationActivity'].map(name=>[name,name]));activityUI.activityUI={};
const base={'react/jsx-runtime':jsx,'react-native':native,'../../components/ActivityUI':activityUI,'../../components/ResourceDetailUI':{detailUI:{}},'../../components/CatalogUI':{CATALOG_COLORS:{}}};
const publication={id:'pub',title:'Guía',description:'Descripción',status:'DISPONIBLE',isWithdrawn:false,campusName:'Campus',files:[{id:'file',name:'guia.pdf',sizeBytes:1024}],careers:[],subjects:[],activity:{pendingRequests:2,completedAgreements:4},acquisition:{modality:'VENTA',amount:2500,currency:'CLP',acquiredAt:'2026-10-23T12:00:00Z'}};

test('physical personal cards retain withdrawn records and delegate transactions without a detail-page callback',()=>{
  const opened=[],agreements=[],reviews=[];const own={...publication,campus:{name:'Origen'},publishedAt:'2026-10-23T12:00:00Z',isWithdrawn:true,modality:'DONACION'};
  const state={loading:false,page:{data:[own],meta:{}},number:1};
  const {PhysicalgoodsHistory}=load('physicalgoods/components/PhysicalgoodsHistory.tsx',{react:{useCallback:fn=>fn},...base,'./PhysicalgoodsAgreements':{PhysicalgoodsAgreements:'Agreements'},'./PhysicalgoodsPublications':{PhysicalgoodsPublications:'Publications'},
    'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})}, '../../components/PersonalUI':{PersonalStatus:'Status'}, '../../components/RequestFlowUI':{RequestTimeline:'Timeline'},'@/components/RefreshScrollView':{useScrollRefresh:noop},'../hooks/usePhysicalgoodsHistory':{usePhysicalgoodsHistory:()=>state},'../types/publication':{resourceConditions:[]}});
  const render=transactions=>{const node=PhysicalgoodsHistory({active:true,transactions,refreshVersion:0,onDetail:value=>opened.push(value),onAgreement:(...args)=>agreements.push(args),onRequests:()=>reviews.push(true)});return elements(typeof node.type==='function'?node.type(node.props):node);};
  let nodes=render(false);const publications=nodes.find(n=>n.type==='Publications');assert.equal(publications.props.active,true);
  publications.props.onRequests();assert.equal(reviews.length,1);publications.props.onDetail({publicationId:'pub'});assert.equal(opened[0].publicationId,'pub');
  state.page.data=[{id:'agreement',publication:own,campus:own.campus,status:'COMPLETADA',startedAt:own.publishedAt,role:'RECEPTOR',modality:'VENTA',amount:1000,currency:'CLP'}];nodes=render(true);
  assert.equal(nodes.find(n=>n.type==='Agreements').props.onAgreement,undefined);assert.equal(nodes.find(n=>n.type==='Agreements').props.active,true);assert.deepEqual(agreements,[]);assert.equal(nodes.filter(n=>n.type==='PublicationActivity').length,0);
});

test('digital personal navigation opens received requests and retains previously visited panels',()=>{
  const h=runtime();const {DigitalPersonalLibrary}=load('elibrary/components/DigitalPersonalLibrary.tsx',{react:h.react,'react/jsx-runtime':jsx,'react-native':native,
    '../../components/CatalogUI':{CatalogTabs:'Tabs'},'../hooks/useDigitalActivity':{useDigitalActivityCounts:()=>({counts:null,loading:false,reload:noop})},'./DigitalAcquiredActivity':{DigitalAcquiredActivity:'Acquired'},'./DigitalPublications':{DigitalPublications:'Owned'},'./DigitalActivityRequests':{DigitalActivityRequests:'Requests'},'./DigitalActivityTransactions':{DigitalActivityTransactions:'Trades'}});
  const render=()=>elements(h.render(()=>DigitalPersonalLibrary({initialTab:'owned'})));
  let nodes=render();assert.equal(nodes.filter(n=>n.type==='Trades').length,0);nodes.find(n=>n.type==='Owned').props.onRequests();nodes=render();
  assert.equal(nodes.find(n=>n.type==='Tabs').props.selected,'requests');assert.equal(nodes.find(n=>n.type==='Requests').props.entryVersion,1);assert.equal(nodes.filter(n=>n.type==='Owned').length,1);
  nodes.find(n=>n.type==='Tabs').props.onSelect('owned');nodes=render();nodes.find(n=>n.type==='Owned').props.onRequests();nodes=render();assert.equal(nodes.find(n=>n.type==='Requests').props.entryVersion,2);h.unmount();
});

test('completed agreement navigation reopens the same acquired ID on every explicit entry',()=>{
 const h=runtime();const {DigitalPersonalLibrary}=load('elibrary/components/DigitalPersonalLibrary.tsx',{react:h.react,'react/jsx-runtime':jsx,'react-native':native,
 '../../components/CatalogUI':{CatalogTabs:'Tabs'},'../hooks/useDigitalActivity':{useDigitalActivityCounts:()=>({counts:null,loading:false,reload:noop})},'./DigitalAcquiredActivity':{DigitalAcquiredActivity:'Acquired'},'./DigitalPublications':{DigitalPublications:'Owned'},'./DigitalActivityRequests':{DigitalActivityRequests:'Requests'},'./DigitalActivityTransactions':{DigitalActivityTransactions:'Trades'}});
 const render=()=>elements(h.render(()=>DigitalPersonalLibrary({initialTab:'transactions'})));let nodes=render();nodes.find(n=>n.type==='Trades').props.onAcquired('pub');nodes=render();assert.equal(nodes.find(n=>n.type==='Tabs').props.selected,'acquired');assert.equal(nodes.find(n=>n.type==='Acquired').props.initialPublicationId,'pub');assert.equal(nodes.find(n=>n.type==='Acquired').props.entryVersion,1);
 nodes.find(n=>n.type==='Tabs').props.onSelect('transactions');nodes=render();nodes.find(n=>n.type==='Trades').props.onAcquired('pub');nodes=render();assert.equal(nodes.find(n=>n.type==='Acquired').props.entryVersion,2);h.unmount();
});

test('acquired material remains downloadable after withdrawal and dispatches the exact authorized file',()=>{
  const saved=[];const state={open:true,detail:{...publication,isWithdrawn:true},items:[],page:1,loading:false,downloading:null,refresh:noop,save:file=>saved.push(file.id)};
  const {AcquiredDigitalResources}=load('elibrary/components/AcquiredDigitalResources.tsx',{...base,react:{useEffect:noop},'lucide-react-native':{},'@/components/RefreshScrollView':{useScrollRefresh:noop},'../hooks/useAcquiredDigitalResources':{useAcquiredDigitalResources:()=>state}});
  const render=()=>elements(AcquiredDigitalResources({embedded:true}));let nodes=render();assert.match(JSON.stringify(nodes),/conserva el acceso/);assert.match(JSON.stringify(nodes),/2.500/);
  let action=nodes.find(n=>n.type==='ActivityAction'&&n.props.accessibilityLabel?.startsWith('Descargar'));assert.equal(action.props.disabled,false);action.props.onPress();assert.deepEqual(saved,['file']);
  state.downloading='file';nodes=render();assert.equal(nodes.find(n=>n.type==='ActivityAction'&&n.props.accessibilityLabel?.startsWith('Descargar')).props.disabled,true);
});

test('owned publication hook retries the failed selected ID, cancels old reads and never restores a closed editor',async()=>{
  const h=runtime(),reads=[],lists=[];
  const {useOwnedDigitalResources}=load('elibrary/hooks/useOwnedDigitalResources.ts',{react:h.react,'../api/elibraryApi':{
    loadOwnedDigitalResources:(page,signal)=>new Promise(resolve=>lists.push({page,signal,resolve})),loadOwnedDigitalResource:(id,signal)=>new Promise((resolve,reject)=>reads.push({id,signal,resolve,reject}))}});
  const render=()=>h.render(()=>useOwnedDigitalResources(true));render();lists[0].resolve({data:[publication],meta:{hasMore:false}});await setImmediate();let state=render();
  const first=state.edit('first');reads[0].reject(new Error('network'));await first;state=render();assert.equal(state.selectedId,'first');assert.ok(state.error);state.reload();assert.equal(reads[1].id,'first');
  state=render();state.close();state=render();assert.equal(reads[1].signal.aborted,true);reads[1].resolve(publication);await setImmediate();state=render();assert.equal(state.selected,null);assert.equal(state.selectedId,null);assert.equal(state.loading,true);
  lists.at(-1).resolve({data:[publication],meta:{hasMore:false}});await setImmediate();state=render();assert.equal(state.loading,false);state.next();state=render();assert.equal(state.page,1);h.unmount();
});

test('acquired detail failure retries its authorization query instead of silently returning to the list',async()=>{
  const h=runtime(),reads=[],lists=[];
  const {useAcquiredDigitalResources}=load('elibrary/hooks/useAcquiredDigitalResources.ts',{react:h.react,'../api/elibraryApi':{loadAcquiredDigitalResources:(page,signal)=>new Promise(resolve=>lists.push({resolve,signal})),loadAcquiredDigitalResource:(id,signal)=>new Promise((resolve,reject)=>reads.push({id,signal,resolve,reject}))},'../api/saveDigitalFile':{}});
  const render=()=>h.render(()=>useAcquiredDigitalResources(true));render();lists[0].resolve({data:[publication],meta:{hasMore:false}});await setImmediate();let state=render();const first=state.show('pub');reads[0].reject(new Error('network'));await first;
  state=render();assert.equal(state.selectedId,'pub');state.refresh();assert.equal(reads[1].id,'pub');assert.equal(lists.length,1);reads[1].resolve({...publication,isWithdrawn:true});await setImmediate();state=render();assert.equal(state.detail.isWithdrawn,true);h.unmount();
});

test('M3 renders the personal tabs, real pending counts and terminal history with actions',()=>{
  const {markup}=renderCatalog('physical',{mode:'personal',width:320});
  for(const text of ['Mis publicaciones','Publicaciones','Solicitudes','Transacciones','Todas','Activas','Reservadas','Finalizadas','Publicación con solicitudes pendientes.','REQUIERE TU ACCIÓN','HISTORIAL','Retirada','Abrir publicación:'])assert.ok(markup.includes(text),text);
  const transactions=renderCatalog('physical',{mode:'transactions'}).markup;assert.match(transactions,/Mis transacciones/);assert.match(transactions,/Coordinando entrega/);assert.match(transactions,/Falta tu confirmación/);assert.match(transactions,/Participantes/);assert.match(transactions,/Monto acordado/);
});

test('L3 owned cards show independent digital activity and keep deactivated publications visible',()=>{
  const {markup}=renderCatalog('digital',{mode:'owned',width:320});
  for(const text of ['Mis publicaciones','Adquiridos','Publicaciones','Solicitudes','Transacciones','Publicación con solicitudes pendientes.','Desactivada','Abrir publicación:'])assert.ok(markup.includes(text),text);
  assert.doesNotMatch(markup,/recurso queda reservado/);
});

test('L3 acquired cards and detail keep authorized originals after deactivation with original acquisition terms',()=>{
  const list=renderCatalog('digital',{mode:'acquired'}).markup;assert.match(list,/Adquirido/);assert.match(list,/Materiales adquiridos/);
  const detail=renderCatalog('digital',{mode:'acquired-detail',width:320}).markup;assert.match(detail,/Descargar archivo completo/);assert.match(detail,/2.500/);assert.match(detail,/los accesos adquiridos se conservan/);assert.doesNotMatch(detail,/Solicitar este recurso/);
});

for(const [screen,mode] of [['physical','personal'],['digital','owned'],['digital','acquired']])test(`${screen} ${mode}: loading and failed reads never masquerade as empty activity`,()=>{
  assert.match(renderCatalog(screen,{mode,state:'loading'}).markup,mode==='acquired'?/Cargando materiales adquiridos/:/Cargando mis publicaciones/);
  const error=renderCatalog(screen,{mode,state:'error'}).markup;assert.match(error,/Reintentar consulta/);assert.match(error,/role="alert"/);assert.doesNotMatch(error,/Aún no hay|No hay transacciones en esta página/);
  const empty=renderCatalog(screen,{mode,state:'empty'}).markup;assert.match(empty,mode==='acquired'?/Explorar Biblioteca/:/Publicar recurso/);
});


test('main activity tabs show independent pending badges from Publicaciones and cap large visible numbers',()=>{
 const options={mode:'personal',variant:'mine',requestCounts:{sentAccepted:1,receivedPending:3,pendingRequests:1,pendingTransactions:2}};
 const markup=renderCatalog('physical',options).markup;
 assert.match(markup,/Solicitudes, 1 solicitud pendiente/);assert.match(markup,/Transacciones, 2 transacciones pendientes/);
 assert.match(markup,/aria-selected="true"[^>]*aria-label="Publicaciones"|aria-label="Publicaciones"[^>]*aria-selected="true"/);
 const large=renderCatalog('physical',{...options,requestCounts:{...options.requestCounts,pendingTransactions:123}}).markup;
 assert.match(large,/Transacciones, 123 transacciones pendientes/);assert.match(large,/>99\+</);
 const zero=renderCatalog('physical',{...options,requestCounts:{sentAccepted:0,receivedPending:0,pendingRequests:0,pendingTransactions:0}}).markup;
 assert.match(zero,/Solicitudes, 0 solicitudes pendientes/);assert.doesNotMatch(zero,/>0<|>99\+</);
});

test('shared rows keep semantic status colors for completed history, pending, accepted and rejected requests',()=>{
 const deps={'react/jsx-runtime':jsx,'react-native':native,'lucide-react-native':{},'@/components/Skeleton':{},'./CatalogUI':{CATALOG_COLORS:{primary:'#002E56',tint:'#E9F0F6'},ui:{}}};
 const {PersonalStatus,PersonalRow,personalStatusLabel}=load('components/PersonalUI.tsx',deps);
 const tone=status=>PersonalStatus({status}).props.style[1].backgroundColor;
 assert.equal(tone('COMPLETADA'),tone('ADQUIRIDO'));assert.equal(tone('COMPLETADA'),tone('FINALIZADO'));
 assert.notEqual(tone('COMPLETADA'),tone('RETIRADA'));assert.notEqual(tone('PENDIENTE'),tone('ACEPTADA'));assert.notEqual(tone('ACEPTADA'),tone('RECHAZADA'));
 assert.equal(tone('RECHAZADA'),tone('CANCELADA'));assert.equal(personalStatusLabel('PENDIENTE_CONFIRMACION'),'Esperando confirmación');
 const row=elements(PersonalRow({title:'Recurso',status:'COMPLETADA',helper:'Campus · fecha',keyData:'$5.000',role:'Recibiste'}));
 assert.equal(row.find(node=>node.type===PersonalStatus).props.status,'COMPLETADA');assert.match(JSON.stringify(row),/Recibiste/);assert.match(JSON.stringify(row),/5.000/);
});

test('empty acquired and owned views expose their real explore/publish actions without affecting refresh',()=>{
 let explored=0,published=0;const state={open:true,items:[],loading:false,page:1,hasMore:false,reload:noop,refresh:noop};
 const {OwnedDigitalResources}=load('elibrary/components/OwnedDigitalResources.tsx',{...base,'../../hooks/useMarketplaceRefresh':{useMarketplaceRefresh:noop},'../hooks/useOwnedDigitalResources':{useOwnedDigitalResources:()=>state},'./DigitalPublicationEditor':{}});
 const owned=elements(OwnedDigitalResources({embedded:true,onPublish:()=>published++})).find(node=>node.type==='ActivityFeedback');assert.equal(owned.props.emptyAction,'Publicar recurso');owned.props.onEmptyAction();assert.equal(published,1);
 const {AcquiredDigitalResources}=load('elibrary/components/AcquiredDigitalResources.tsx',{...base,react:{useEffect:noop},'lucide-react-native':{},'@/components/RefreshScrollView':{useScrollRefresh:noop},'../hooks/useAcquiredDigitalResources':{useAcquiredDigitalResources:()=>state}});
 const acquired=elements(AcquiredDigitalResources({embedded:true,onExplore:()=>explored++})).find(node=>node.type==='ActivityFeedback');assert.equal(acquired.props.emptyAction,'Explorar Biblioteca');acquired.props.onEmptyAction();assert.equal(explored,1);assert.equal(acquired.props.onReload,noop);
});
