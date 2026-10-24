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
    assert.ok(Object.hasOwn(deps, name), name); return deps[name];
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

test('physical personal cards retain terminal and withdrawn records and route exact detail/agreement IDs',()=>{
  const opened=[],agreements=[],reviews=[];const own={...publication,campus:{name:'Origen'},publishedAt:'2026-10-23T12:00:00Z',isWithdrawn:true,modality:'DONACION'};
  const state={loading:false,page:{data:[own],meta:{}},number:1};
  const {PhysicalgoodsHistory}=load('physicalgoods/components/PhysicalgoodsHistory.tsx',{...base,'@/components/RefreshScrollView':{useScrollRefresh:noop},'../hooks/usePhysicalgoodsHistory':{usePhysicalgoodsHistory:()=>state},'../types/publication':{resourceConditions:[]}});
  const render=transactions=>elements(PhysicalgoodsHistory({active:true,transactions,refreshVersion:0,onDetail:value=>opened.push(value),onAgreement:(...args)=>agreements.push(args),onRequests:()=>reviews.push(true)}));
  let nodes=render(false);assert.equal(nodes.find(n=>n.type==='ActivityCard').props.historical,true);assert.equal(nodes.find(n=>n.type==='ActivityCard').props.status,'RETIRADA');
  const activity=nodes.find(n=>n.type==='PublicationActivity');assert.equal(activity.props.activity.pendingRequests,2);activity.props.onRequests();assert.equal(reviews.length,1);
  nodes.find(n=>n.type==='ActivityAction').props.onPress();assert.equal(opened[0].publicationId,'pub');
  state.page.data=[{id:'agreement',publication:own,campus:own.campus,status:'COMPLETADA',startedAt:own.publishedAt,role:'RECEPTOR',modality:'VENTA',amount:1000,currency:'CLP'}];nodes=render(true);
  assert.equal(nodes.find(n=>n.type==='ActivityCard').props.historical,true);nodes.find(n=>n.type==='ActivityAction').props.onPress();assert.deepEqual(agreements,[['pub','agreement']]);assert.equal(nodes.filter(n=>n.type==='PublicationActivity').length,0);
});

test('digital personal navigation opens received requests and retains previously visited panels',()=>{
  const h=runtime();const {DigitalPersonalLibrary}=load('elibrary/components/DigitalPersonalLibrary.tsx',{react:h.react,'react/jsx-runtime':jsx,'react-native':native,
    '../../components/CatalogUI':{CatalogTabs:'Tabs'},'./AcquiredDigitalResources':{AcquiredDigitalResources:'Acquired'},'./OwnedDigitalResources':{OwnedDigitalResources:'Owned'},'./DigitalTradeCenter':{DigitalTradeCenter:'Trades'}});
  const render=()=>elements(h.render(()=>DigitalPersonalLibrary({initialTab:'owned'})));
  let nodes=render();assert.equal(nodes.filter(n=>n.type==='Trades').length,0);nodes.find(n=>n.type==='Owned').props.onRequests();nodes=render();
  assert.equal(nodes.find(n=>n.type==='Tabs').props.selected,'trades');assert.equal(nodes.find(n=>n.type==='Trades').props.receivedEntryVersion,1);assert.equal(nodes.filter(n=>n.type==='Owned').length,1);
  nodes.find(n=>n.type==='Tabs').props.onSelect('owned');nodes=render();nodes.find(n=>n.type==='Owned').props.onRequests();nodes=render();assert.equal(nodes.find(n=>n.type==='Trades').props.receivedEntryVersion,2);h.unmount();
});

test('completed agreement navigation reopens the same acquired ID on every explicit entry',()=>{
 const h=runtime();const {DigitalPersonalLibrary}=load('elibrary/components/DigitalPersonalLibrary.tsx',{react:h.react,'react/jsx-runtime':jsx,'react-native':native,
 '../../components/CatalogUI':{CatalogTabs:'Tabs'},'./AcquiredDigitalResources':{AcquiredDigitalResources:'Acquired'},'./OwnedDigitalResources':{OwnedDigitalResources:'Owned'},'./DigitalTradeCenter':{DigitalTradeCenter:'Trades'}});
 const render=()=>elements(h.render(()=>DigitalPersonalLibrary({initialTab:'trades'})));let nodes=render();nodes.find(n=>n.type==='Trades').props.onAcquired('pub');nodes=render();assert.equal(nodes.find(n=>n.type==='Tabs').props.selected,'acquired');assert.equal(nodes.find(n=>n.type==='Acquired').props.initialPublicationId,'pub');assert.equal(nodes.find(n=>n.type==='Acquired').props.entryVersion,1);
 nodes.find(n=>n.type==='Tabs').props.onSelect('trades');nodes=render();nodes.find(n=>n.type==='Trades').props.onAcquired('pub');nodes=render();assert.equal(nodes.find(n=>n.type==='Acquired').props.entryVersion,2);h.unmount();
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
  for(const text of ['Mi actividad','Publicaciones','Enviadas','Recibidas','Transacciones','2 solicitudes pendientes','Revisar solicitudes','Historial conservado','Retirada','Ver publicación'])assert.ok(markup.includes(text),text);
  const transactions=renderCatalog('physical',{mode:'transactions'}).markup;assert.match(transactions,/Completada/);assert.match(transactions,/Cancelada/);assert.match(transactions,/Ver acuerdo/);
});

test('L3 owned cards show independent digital activity and keep deactivated publications visible',()=>{
  const {markup}=renderCatalog('digital',{mode:'owned',width:320});
  for(const text of ['Mi biblioteca','Adquiridos','Publicaciones','Acuerdos','2 solicitudes pendientes','4 acuerdos completados','Disponible para nuevos acuerdos','Desactivada','Consultar publicación'])assert.ok(markup.includes(text),text);
  assert.doesNotMatch(markup,/recurso queda reservado/);
});

test('L3 acquired cards and detail keep authorized originals after deactivation with original acquisition terms',()=>{
  const list=renderCatalog('digital',{mode:'acquired'}).markup;assert.match(list,/Abrir materiales/);assert.match(list,/Acceso conservado tras la desactivación/);
  const detail=renderCatalog('digital',{mode:'acquired-detail',width:320}).markup;assert.match(detail,/Descargar archivo completo/);assert.match(detail,/2.500/);assert.match(detail,/Tu adquisición conserva el acceso/);assert.doesNotMatch(detail,/Solicitar este recurso/);
});

for(const [screen,mode] of [['physical','personal'],['digital','owned'],['digital','acquired']])test(`${screen} ${mode}: loading and failed reads never masquerade as empty activity`,()=>{
  assert.match(renderCatalog(screen,{mode,state:'loading'}).markup,/Cargando actividad/);
  const error=renderCatalog(screen,{mode,state:'error'}).markup;assert.match(error,/Reintentar consulta/);assert.match(error,/role="alert"/);assert.doesNotMatch(error,/Aún no hay|No hay transacciones en esta página/);
  const empty=renderCatalog(screen,{mode,state:'empty'}).markup;assert.match(empty,/Actualizar lista/);
});
