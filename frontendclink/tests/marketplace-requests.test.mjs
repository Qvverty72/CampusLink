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
  vm.runInNewContext(code, { module, exports: module.exports, AbortController, URLSearchParams, require(name) {
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

class AuthApiError extends Error {}
const physicalRow = (id='first', resourceStatus='DISPONIBLE') => ({ id, status:'PENDIENTE', owner:{id:'owner',fullName:'Camila'},requester:{id:'requester',fullName:'Diego'}, canResolve:true,
  publication:{id:'publication', title:'Calculadora',status:resourceStatus,canView:true,modality:'VENTA',price:15000}, campus:{id:'campus',name:'Campus'}, requestedAt:'2026-10-23T12:00:00Z', message:'Me interesa' });
const digitalRow = (id='first') => ({id,publicationId:'publication',title:'Guía',requesterName:'Diego',status:'PENDIENTE',requestedAt:'2026-10-23T12:00:00Z',message:'Me interesa'});
const deferred = () => { let resolve,reject; const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject}; };
function physicalHook() {
  const h=runtime(),reads=[],writes=[];let received=true;
  const {usePhysicalgoodsRequests}=load('physicalgoods/hooks/usePhysicalgoodsRequests.ts', { react:h.react,
    '@/features/auth/hooks/useAuth':{useAuth:()=>({refreshIdentity:noop})}, '@/lib/api/authenticated-request':{AuthApiError},
    '../api/physicalgoodsApi':{ loadPhysicalgoodsRequests:(page,received,signal)=>{const result=deferred();reads.push({...result,page,received,signal});return result.promise;},
      resolvePhysicalgoodsRequest:(...args)=>{const result=deferred();writes.push({...result,args});return result.promise;} } });
  return {h,reads,writes,mode:value=>{received=value;},render:()=>h.render(()=>usePhysicalgoodsRequests(true,noop,received))};
}
function digitalHook() {
  const h=runtime(),reads=[],writes=[],trades=[];
  const {useDigitalTradeCenter}=load('elibrary/hooks/useDigitalTrades.ts',{react:h.react,'@/lib/api/authenticated-request':{AuthApiError},'@/features/auth/hooks/useAuth':{useAuth:()=>({identity:{userId:'viewer'}})}, '@/lib/api/operation-id':{},
    '../api/digitalTradesApi':{loadDigitalRequests:(received,page,signal)=>{const result=deferred();reads.push({...result,received,page,signal});return result.promise;},
      resolveDigitalRequest:(...args)=>{const result=deferred();writes.push({...result,args});return result.promise;},
      loadDigitalTrade:(...args)=>{const result=deferred();trades.push({...result,args});return result.promise;} }});
  return {h,reads,writes,trades,render:()=>h.render(()=>useDigitalTradeCenter(true))};
}
const flush=()=>setImmediate();

test('request counters load independently, retain last totals on refresh and reject stale scope responses',async()=>{
 const h=runtime(),reads=[];let active=true,version=0,identity={userId:'me',campusId:'campus'};
 const {usePhysicalgoodsRequestCounts}=load('physicalgoods/hooks/usePhysicalgoodsRequestCounts.ts',{react:h.react,
  '@/features/auth/hooks/useAuth':{useAuth:()=>({identity,refreshIdentity:noop})},'@/lib/api/authenticated-request':{AuthApiError},
  '../api/physicalgoodsApi':{loadPhysicalgoodsRequestCounts:signal=>{const result=deferred();reads.push({...result,signal});return result.promise;}}});
 const render=()=>h.render(()=>usePhysicalgoodsRequestCounts(active,version));
 assert.equal(render().counts,undefined);assert.equal(reads.length,1);
 reads[0].resolve({sentAccepted:2,receivedPending:14});await flush();
 assert.equal(render().counts.receivedPending,14);assert.equal(render().loading,false);
 render().reload();render();assert.equal(reads.length,2);assert.equal(render().counts.sentAccepted,2);assert.equal(render().loading,false);
 version++;render();assert.equal(reads[1].signal.aborted,true);
 reads[1].resolve({sentAccepted:999,receivedPending:999});reads[2].reject(new Error('offline'));await flush();
 assert.equal(render().counts.sentAccepted,2);assert.ok(render().error);assert.equal(render().loading,false);
 identity={userId:'other',campusId:'other-campus'};assert.equal(render().counts,undefined);assert.equal(reads.length,4);
 identity={userId:'third',campusId:'campus'};render();assert.equal(reads[3].signal.aborted,true);
 reads[3].resolve({sentAccepted:777,receivedPending:777});reads[4].resolve({sentAccepted:0,receivedPending:0});await flush();
 assert.equal(render().counts.sentAccepted,0);assert.equal(render().counts.receivedPending,0);
 active=false;render();assert.equal(reads.length,5);active=true;assert.equal(render().counts.receivedPending,0);assert.equal(reads.length,6);
 h.unmount();assert.equal(reads[5].signal.aborted,true);
});

const {sentRequestPresentation}=load('physicalgoods/utils/sentRequestPresentation.ts',{});
const indicators=load('physicalgoods/utils/receivedRequestIndicators.ts',{});
const sentRow=(id='first')=>({...physicalRow(id),owner:{id:'owner',fullName:'Camila González'},requester:{id:'me',fullName:'Diego'},publication:{...physicalRow().publication,modality:'VENTA',price:45000},transaction:null});

test('received resource priority follows transaction lifecycle and publication age without mutating requests',()=>{
 const group=(id,date,status='PENDIENTE',transaction=null)=>[{...sentRow(id),status,transaction,publication:{...sentRow().publication,id,publishedAt:date}}];
 const finished=group('finished','2026-10-25','ACEPTADA',{id:'tx-finished',status:'COMPLETADA'}),old=group('old','2026-10-20'),recent=group('recent','2026-10-24');
 const active=group('active','2026-10-18','ACEPTADA',{id:'tx-active',status:'RESERVADA'}),confirming=group('confirming','2026-10-19','ACEPTADA',{id:'tx-confirming',status:'PENDIENTE_CONFIRMACION'}),rejected=group('rejected','2026-10-25','RECHAZADA');
 active.push({...sentRow('waiting'),publication:active[0].publication});
 const sort=groups=>groups.slice().sort(indicators.compareReceivedResources).map(rows=>rows[0].publication.id);
 const groups=[finished,old,recent,active,confirming,rejected];
 assert.deepEqual(sort(groups),['confirming','active','recent','old','rejected','finished']);
 assert.equal(groups[0],finished);assert.equal(active.length,2);
 active[0].transaction.status='COMPLETADA';active[1].status='CANCELADA';
 assert.deepEqual(sort(groups),['confirming','recent','old','rejected','finished','active']);
 assert.equal(indicators.receivedResourcePriority([{...sentRow(),status:'ACEPTADA',transaction:{id:'cancelled',status:'CANCELADA'}}]),2);
 const sameDate=group('a','2026-10-24');assert.deepEqual(sort([recent,sameDate]),['a','recent']);
 const microOld=group('a','2026-10-24T12:00:00.123001Z'),microNew=group('z','2026-10-24T12:00:00.123002Z');
 assert.deepEqual(sort([microOld,microNew]),['z','a']);
 delete old[0].publication.publishedAt;assert.equal(indicators.compareReceivedResources(old,recent),0);
 old[0].publication.publishedAt='invalid';assert.equal(indicators.compareReceivedResources(old,recent),0);
});

test('received indicators separate unhandled requests from transactions through both confirmations and completion',()=>{
 const pending=sentRow(),accepted={...sentRow('accepted'),status:'ACEPTADA',transaction:{id:'tx',status:'RESERVADA'}};
 assert.equal(indicators.isReceivedRequestAwaitingResponse(pending),true);assert.equal(indicators.receivedTransactionLabel([pending]),'0 transacciones pendientes');
 assert.equal(indicators.isReceivedRequestAwaitingResponse(accepted),false);assert.equal(indicators.receivedTransactionLabel([pending,accepted,accepted]),'1 transacción pendiente');
 accepted.transaction.status='PENDIENTE_CONFIRMACION';assert.equal(indicators.receivedTransactionLabel([accepted]),'1 transacción pendiente');
 accepted.transaction.status='COMPLETADA';assert.equal(indicators.receivedTransactionLabel([accepted]),'Transacción finalizada');assert.equal(indicators.isReceivedRequestAwaitingResponse({...accepted,status:'PENDIENTE'}),false);
 accepted.transaction.status='CANCELADA';assert.equal(indicators.receivedTransactionLabel([accepted]),'Transacción cancelada');
 for(const status of ['ACEPTADA','RECHAZADA','CANCELADA'])assert.equal(indicators.isReceivedRequestAwaitingResponse({...pending,status}),false);
});

test('request resource maps original terms without creating a transaction and restricts the gallery through the shared reader',()=>{
  const reads=[],state={product:null,loading:false,unavailable:true};
  const {PhysicalgoodsRequestProduct}=load('physicalgoods/components/PhysicalgoodsRequestProduct.tsx',{'react/jsx-runtime':jsx,'react-native':{Text:'Text'},
    '../../components/AgreementProductUI':{AgreementProductModal:'ProductModal',AgreementParticipants:'Participants'},'../../components/ResourceDetailUI':{detailUI:{}},
    '../../utils/agreementPresentation':{agreementCopy:{}},'../hooks/usePhysicalgoodsAgreementProduct':{usePhysicalgoodsAgreementProduct:(...args)=>{reads.push(args);return state;}},
    './PhysicalgoodsAgreementProduct':{PhysicalgoodsProductCard:'ProductCard'}});
  const row=sentRow();row.publication.canView=false;
  let tree=PhysicalgoodsRequestProduct({request:row,onClose:noop});assert.equal(tree.props.title,'Recurso de la solicitud');assert.equal(reads[0][0].id,row.id);assert.equal(reads[0][1],true);
  let product=elements(tree).find(n=>n.type==='ProductCard');assert.equal(product.props.detail.amount,45000);assert.match(product.props.dateLabel,/Solicitud enviada el/);
  state.product={modality:'DONACION',price:null};tree=PhysicalgoodsRequestProduct({request:row,onClose:noop});product=elements(tree).find(n=>n.type==='ProductCard');assert.equal(product.props.detail.modality,'DONACION');assert.equal(product.props.detail.amount,null);
  row.transaction={id:'trade',status:'COMPLETADA',modality:'VENTA',amount:1000,currency:'CLP'};
  tree=PhysicalgoodsRequestProduct({request:row,onClose:noop});product=elements(tree).find(n=>n.type==='ProductCard');assert.equal(product.props.detail.amount,1000);
  assert.equal(elements(tree).find(n=>n.type==='Participants').props.currentUserId,'me');
  tree=PhysicalgoodsRequestProduct({request:row,onClose:noop,viewerRole:'PROPIETARIO',grouped:true});
  assert.equal(reads.at(-1)[0].role,'PROPIETARIO');assert.ok(elements(tree).every(n=>n.type!=='Participants'));
  product=elements(tree).find(n=>n.type==='ProductCard');assert.equal(product.props.dateLabel,null);assert.equal(product.props.detail.modality,'DONACION');
});

test('sent summaries retain pending reservations, real terminal states and original agreement amounts',()=>{
  const row=sentRow();row.publication.status='RESERVADO';
  let result=sentRequestPresentation(row);assert.equal(result.tone,'pending');assert.match(result.status,/sigue pendiente/);assert.doesNotMatch(result.status,/rechaz|eligió/i);
  row.status='ACEPTADA';row.transaction={id:'trade',status:'COMPLETADA',modality:'VENTA',amount:15000,currency:'CLP'};
  result=sentRequestPresentation(row);assert.equal(result.tone,'completed');assert.equal(result.amount,'$15.000');assert.equal(result.amountLabel,'Monto acordado');
  row.publication.modality='DONACION';row.publication.price=null;assert.equal(sentRequestPresentation(row).amount,'$15.000');
  row.transaction.status='CANCELADA';assert.equal(sentRequestPresentation(row).tone,'closed');
  row.transaction=null;row.status='RECHAZADA';result=sentRequestPresentation(row);assert.match(result.status,/Camila rechazó/);assert.equal(result.amount,'Donación');assert.equal(result.amountLabel,'Modalidad');
});

test('sent accordion starts closed, keeps selection on refresh and opens a resource modal without navigation or reload',()=>{
  const h=runtime(),state={page:{data:[sentRow(),sentRow('second')]},number:1,loading:false,busy:false,selection:null};
  const {PhysicalgoodsSentRequests}=load('physicalgoods/components/PhysicalgoodsSentRequests.tsx',{'react/jsx-runtime':jsx,react:h.react,'react-native':native,
    './PhysicalgoodsRequestProduct':{PhysicalgoodsRequestProduct:'ResourceModal'},
    '../../components/SentRequestCard':{SentRequestCard:'Card',SentRequestsSkeleton:'Skeleton'},'../../components/RequestsUI':requestsUI,
    '../../components/ResourceDetailUI':{detailUI:{}},'../utils/sentRequestPresentation':{sentRequestPresentation}});
  const render=()=>elements(h.render(()=>PhysicalgoodsSentRequests({state})));
  const cards=()=>render().filter(n=>n.type==='Card');
  assert.deepEqual(cards().map(n=>n.props.expanded),[false,false]);cards()[1].props.onToggle();assert.deepEqual(cards().map(n=>n.props.expanded),[false,true]);
  state.loading=true;assert.ok(render().some(n=>n.type==='Skeleton'));state.loading=false;assert.equal(cards()[1].props.expanded,true);
  cards()[1].props.onToggle();assert.ok(cards().every(n=>!n.props.expanded));state.number=2;assert.ok(cards().every(n=>!n.props.expanded));
  cards()[0].props.onToggle();const first=cards()[0];assert.equal(first.props.onDetails,undefined);
  elements(first).find(n=>n.type==='RequestButton'&&n.props.label==='Ver recurso').props.onPress();
  let modal=render().find(n=>n.type==='ResourceModal');assert.equal(modal.props.request.id,'first');
  state.loading=true;assert.ok(render().some(n=>n.type==='ResourceModal'));state.loading=false;
  modal.props.onClose();assert.equal(render().some(n=>n.type==='ResourceModal'),false);assert.equal(cards()[0].props.expanded,true);
  state.page.data[0]={...sentRow(),publication:{...sentRow().publication,canView:false,isWithdrawn:true},transaction:{id:'agreement',status:'COMPLETADA'}};
  const historical=cards()[0];elements(historical).find(n=>n.props?.label==='Ver recurso').props.onPress();
  modal=render().find(n=>n.type==='ResourceModal');assert.equal(modal.props.request.publication.canView,false);
  assert.ok(render().every(n=>!['Aceptar','Rechazar','Ver transacción','Ver solicitud'].includes(n.props?.label)));h.unmount();
});

test('physical decisions require confirmation, serialize writes and recover a lost reply from the refreshed state',async()=>{
  const q=physicalHook();q.render();q.reads[0].resolve({data:[physicalRow(),physicalRow('second')],meta:{hasMore:false}});await flush();
  let state=q.render();state.select(physicalRow(),'ACEPTAR');state=q.render();assert.equal(q.writes.length,0);assert.equal(state.selection.request.id,'first');
  state.cancel();state=q.render();await state.resolve();assert.equal(q.writes.length,0);
  state.select(physicalRow(),'ACEPTAR');state=q.render();const pending=state.resolve();state.resolve();assert.equal(q.writes.length,1);assert.equal(q.render().saving.id,'first');
  assert.deepEqual(Array.from(q.writes[0].args.slice(0,3)),['publication','first','ACEPTAR']);
  q.writes[0].reject(new Error('lost reply'));await pending;state=q.render();assert.ok(state.error);assert.equal(state.feedback,null);state=q.render();assert.equal(q.reads.length,2);
  q.reads[1].resolve({data:[{...physicalRow(),status:'ACEPTADA'},physicalRow('second','RESERVADO')],meta:{hasMore:false}});await flush();state=q.render();assert.equal(state.error,null);assert.match(state.feedback,/aceptada/);
  state.select(physicalRow('second'),'ACEPTAR');state=q.render();assert.equal(state.selection,null);
  state.select(physicalRow('second'),'RECHAZAR');state=q.render();assert.equal(state.selection.decision,'RECHAZAR');assert.equal(q.writes.length,1);q.h.unmount();
});

test('physical mode changes abort obsolete reads and sent requests never allow resolving',async()=>{
  const q=physicalHook();q.render();q.mode(false);q.render();assert.equal(q.reads[0].signal.aborted,true);
  q.reads[1].resolve({data:[physicalRow('sent')],meta:{hasMore:false}});await flush();q.reads[0].resolve({data:[physicalRow('old')],meta:{hasMore:false}});await flush();
  let state=q.render();assert.equal(state.page.data[0].id,'sent');state.select(physicalRow('sent'),'RECHAZAR');state=q.render();assert.equal(state.selection,null);await state.resolve();assert.equal(q.writes.length,0);q.h.unmount();
});

test('resource modal refresh updates only its cached group without fetching the outer list again',async()=>{
 const q=physicalHook();q.render();const other={...physicalRow('other'),publication:{...physicalRow().publication,id:'other-resource'}};
 const meta={page:1,limit:10,hasMore:true};q.reads[0].resolve({data:[physicalRow('first'),physicalRow('second'),other],meta});await flush();
 let state=q.render();state.receiveResourceRows('publication',[physicalRow('new'),other]);state=q.render();
 assert.deepEqual(Array.from(state.page.data,row=>row.id),['new','other']);assert.equal(state.page.meta,meta);assert.equal(q.reads.length,1);
 state.receiveResourceRows('not-on-this-page',[physicalRow('ignored')]);assert.deepEqual(Array.from(q.render().page.data,row=>row.id),['new','other']);q.h.unmount();
});

test('digital acceptance confirms a selected recipient and leaves another pending request actionable',async()=>{
  const q=digitalHook();let state=q.render();state.mode(true);q.render();q.reads.at(-1).resolve({data:[digitalRow(),digitalRow('second')],meta:{hasMore:false}});await flush();state=q.render();
  state.select(digitalRow(),'ACEPTAR');state=q.render();assert.equal(q.writes.length,0);state.cancelSelection();state=q.render();state.resolve();assert.equal(q.writes.length,0);
  state.select(digitalRow(),'ACEPTAR');state=q.render();const pending=state.resolve();state.resolve();assert.equal(q.writes.length,1);assert.equal(q.writes[0].args[0].id,'first');
  q.writes[0].resolve({});await pending;q.render();q.render();q.reads.at(-1).resolve({data:[{...digitalRow(),status:'ACEPTADA'},digitalRow('second')],meta:{hasMore:false}});await flush();state=q.render();
  state.select(digitalRow('second'),'ACEPTAR');state=q.render();assert.equal(state.selection.request.id,'second');assert.equal(q.writes.length,1);q.h.unmount();
});

test('digital uncertain result only rereads and keeps the error until the matching decision is observed',async()=>{
  const q=digitalHook();let state=q.render();state.mode(true);q.render();q.reads.at(-1).resolve({data:[digitalRow()],meta:{hasMore:false}});await flush();state=q.render();state.select(digitalRow(),'RECHAZAR');state=q.render();
  const pending=state.resolve();q.writes[0].reject(new TypeError('network'));await pending;q.render();q.render();
  q.reads.at(-1).resolve({data:[digitalRow()],meta:{hasMore:false}});await flush();state=q.render();assert.match(state.error,/actualiza el estado/);assert.equal(q.writes.length,1);
  state.reload();q.render();q.reads.at(-1).resolve({data:[{...digitalRow(),status:'RECHAZADA'}],meta:{hasMore:false}});await flush();state=q.render();assert.equal(state.error,null);assert.equal(q.writes.length,1);q.h.unmount();
});

test('digital obsolete agreement reads are aborted when changing inbox, without a stuck loading state',async()=>{
  const q=digitalHook();q.render();q.reads[0].resolve({data:[{...digitalRow(),transactionId:'trade'}],meta:{hasMore:false}});await flush();let state=q.render();
  const pending=state.showTrade({...digitalRow(),transactionId:'trade'});state=q.render();assert.equal(state.loading,true);state.mode(true);q.render();
  assert.equal(q.trades[0].args[2].aborted,true);q.trades[0].resolve({id:'old'});await pending;q.reads.at(-1).resolve({data:[],meta:{hasMore:false}});await flush();state=q.render();assert.equal(state.trade,null);assert.equal(state.loading,false);q.h.unmount();
});

const native={View:'View',Text:'Text',Pressable:'Button',Modal:'Modal',ScrollView:'Scroll',ActivityIndicator:'Spinner',StyleSheet:{create:value=>value}};
const requestsUI=Object.fromEntries(['RequestButton','RequestCard','RequestDecisionDialog','RequestsFeedback','RequestsHeader','RequestsPager', 'RequestSegments'].map(name=>[name,name]));
requestsUI.requestUI={};requestsUI.requestStatusLabel=value=>value;
test('physical reserved and historical cards preserve detail access and prevent a second acceptance',()=>{
  const calls=[];const state={page:{data:[physicalRow('reserved','RESERVADO'),{...physicalRow('history'),canResolve:false,publication:{...physicalRow().publication,canView:false,isWithdrawn:true}}],meta:{}},number:1,loading:false,busy:false,reload:noop};
  const h=runtime();const {PhysicalgoodsReceivedRequests}=load('physicalgoods/components/PhysicalgoodsReceivedRequests.tsx',{'react/jsx-runtime':jsx,react:h.react,'react-native':native,
    '../hooks/usePhysicalgoodsRequests':{usePhysicalgoodsRequests:()=>state},
    '../utils/receivedRequestIndicators':indicators,
    '../../components/ResourceRequestsModal':{ResourceRequestsModal:'ResourceModal',ResourceRequestsRow:'ResourceRow'},'../../components/RequestAccordionCard':{RequestAccordionSkeleton:'Skeleton'},
    '../../components/CatalogUI':{CATALOG_COLORS:{}},'../../components/ResourceDetailUI':{detailUI:{}},'../../components/RequestsUI':requestsUI});
  const render=()=>{const base=elements(h.render(()=>PhysicalgoodsReceivedRequests({state,onDetail:(...args)=>calls.push(args),onAgreement:noop})));const controller=base.find(n=>typeof n.type==='function'&&n.type.name==='PhysicalgoodsReceivedResource');return [...base,...(controller?elements(controller.type(controller.props)):[])];};
  assert.equal(render().some(n=>n.type==='ResourceModal'),false);render().find(n=>n.type==='ResourceRow').props.onPress();
  const modal=render().find(n=>n.type==='ResourceModal');assert.equal(modal.props.requests[0].canAccept,false);assert.equal(modal.props.requests[0].canReject,true);
  assert.equal(modal.props.requests[1].canAccept,false);assert.equal(modal.props.requests[1].canReject,false);
  modal.props.requests[1].onDetails();assert.deepEqual(calls,[['publication','history']]);assert.equal(render().some(n=>n.type==='ResourceModal'),false);h.unmount();
});

test('received resources open a single modal that survives refresh, preserves decisions and stays scoped to the page and user',()=>{
 const h=runtime(),calls=[],rows=Array.from({length:10},(_,index)=>physicalRow(`request-${index}`));
 rows.push({...physicalRow('different'),publication:{...physicalRow().publication,id:'different-publication'}});
 const state={page:{data:rows},number:1,scope:'owner:campus',loading:false,busy:false,selection:null,select:(...args)=>calls.push(args),reload:()=>calls.push('reload'),resolve:()=>calls.push('resolved'),cancel:()=>{state.selection=null;}};
 const {PhysicalgoodsReceivedRequests,groupReceivedRequests}=load('physicalgoods/components/PhysicalgoodsReceivedRequests.tsx',{'react/jsx-runtime':jsx,react:h.react,'react-native':native,
  '../hooks/usePhysicalgoodsRequests':{usePhysicalgoodsRequests:()=>state},
  '../utils/receivedRequestIndicators':indicators,
  '../../components/ResourceRequestsModal':{ResourceRequestsModal:'ResourceModal',ResourceRequestsRow:'ResourceRow'},'../../components/RequestAccordionCard':{RequestAccordionSkeleton:'Skeleton'},
  '../../components/CatalogUI':{CATALOG_COLORS:{}},'../../components/ResourceDetailUI':{detailUI:{}},'../../components/RequestsUI':requestsUI});
 const render=()=>{const base=elements(h.render(()=>PhysicalgoodsReceivedRequests({state,onDetail:noop,onAgreement:noop})));const controller=base.find(n=>typeof n.type==='function'&&n.type.name==='PhysicalgoodsReceivedResource');return [...base,...(controller?elements(controller.type(controller.props)):[])];};
 let resources=render().filter(n=>n.type==='ResourceRow');assert.equal(resources.length,2);assert.equal(resources[0].props.count,10);assert.equal(render().some(n=>n.type==='ResourceModal'),false);
 assert.deepEqual(Array.from(groupReceivedRequests(rows),group=>group.length),[10,1]);resources[0].props.onPress();
 let modal=render().find(n=>n.type==='ResourceModal');assert.equal(modal.props.requests.length,10);modal.props.requests[9].onAccept();assert.equal(calls[0][0].id,'request-9');assert.equal(calls[0][1],'ACEPTAR');
 state.selection={request:rows[9],decision:'ACEPTAR'};modal=render().find(n=>n.type==='ResourceModal');assert.equal(modal.props.overlay.props.embedded,true);modal.props.overlay.props.onConfirm();assert.equal(calls.at(-1),'resolved');modal.props.onClose();assert.equal(state.selection,null);assert.ok(render().some(n=>n.type==='ResourceModal'));
 state.loading=true;state.page=null;modal=render().find(n=>n.type==='ResourceModal');assert.equal(modal.props.loading,true);assert.equal(modal.props.requests.length,10);
 state.loading=false;state.page={data:rows};modal=render().find(n=>n.type==='ResourceModal');state.busy=true;modal.props.onClose();assert.ok(render().some(n=>n.type==='ResourceModal'));state.busy=false;
 render().find(n=>n.type==='ResourceModal').props.onClose();assert.equal(render().some(n=>n.type==='ResourceModal'),false);assert.ok(!calls.includes('reload'));
 render().find(n=>n.type==='ResourceRow').props.onPress();state.number=2;assert.equal(render().some(n=>n.type==='ResourceModal'),false);render().find(n=>n.type==='ResourceRow').props.onPress();state.scope='other:campus';assert.equal(render().some(n=>n.type==='ResourceModal'),false);h.unmount();
});

test('resource modal paginates from exactly ten, orders dates, clamps refreshed pages and uses its refresh callback',()=>{
 const all=Array.from({length:11},(_,index)=>({id:`id-${index}`,name:`Persona ${index}`,careers:['Informática'],requestedAt:new Date(Date.UTC(2026,9,24,10,index)).toISOString(),message:'Me interesa',status:'Esperando respuesta',tone:'pending',canAccept:true,canReject:true,onAccept:()=>{},onReject:()=>{}}));
 for(const count of [9,10,11]){
  const h=runtime(),calls=[];const ui=load('components/ResourceRequestsModal.tsx',{'react/jsx-runtime':jsx,react:h.react,'react-native':{...native,TouchableOpacity:'Touch'},'lucide-react-native':{Package:'Package',ChevronRight:'Chevron'},'@/components/Pagination':{Pagination:'Pagination'},'@/components/Skeleton':{Skeleton:'Skeleton',SkeletonBlock:'Block'},'./AgreementStepModal':{AgreementStepModal:'StepModal'},'./CatalogUI':{CATALOG_COLORS:{}},'./RequestsUI':{RequestButton:'Action'}});
  const props={title:'Recurso',summary:'Donación',requests:all.slice(0,count),loading:false,error:null,onClose:noop,onRefresh:()=>calls.push('refresh')};
  const render=()=>{const nodes=elements(h.render(()=>ui.ResourceRequestsModal(props)));return [...nodes,...elements(nodes.find(n=>n.type==='StepModal').props.footer)];};
  let nodes=render();assert.equal(nodes.some(n=>n.type==='Pagination'),count>=10);assert.equal(nodes.filter(n=>n.props?.accessibilityLabel?.startsWith('Revisar solicitud de')).length,Math.min(10,count));
  assert.equal(nodes.filter(n=>n.props?.accessibilityLabel?.startsWith('Aceptar solicitud de')||n.props?.accessibilityLabel?.startsWith('Rechazar solicitud de')).length,0);
  nodes.find(n=>n.props?.accessibilityLabel==='Revisar solicitud de Persona 0').props.onPress();nodes=render();assert.equal(nodes.filter(n=>n.props?.accessibilityLabel?.startsWith('Aceptar solicitud de')||n.props?.accessibilityLabel?.startsWith('Rechazar solicitud de')).length,2);
  nodes.find(n=>n.props?.accessibilityLabel==='Revisar solicitud de Persona 0').props.onPress();nodes=render();assert.equal(nodes.some(n=>n.props?.accessibilityLabel?.startsWith('Aceptar solicitud de')),false);
  nodes.find(n=>n.type==='StepModal').props.refresh.onRefresh();assert.deepEqual(calls,['refresh']);
  if(count===11){nodes.find(n=>n.props?.accessibilityLabel==='Revisar solicitud de Persona 0').props.onPress();nodes=render();nodes.find(n=>n.type==='Pagination').props.onPageChange(2);nodes=render();assert.equal(nodes.filter(n=>n.props?.accessibilityLabel?.startsWith('Revisar solicitud de')).length,1);assert.ok(nodes.some(n=>n.props?.accessibilityLabel==='Revisar solicitud de Persona 10'));assert.equal(nodes.some(n=>n.props?.accessibilityLabel?.startsWith('Aceptar solicitud de')),false);
   nodes.find(n=>n.props?.accessibilityLabel==='Revisar solicitud de Persona 10').props.onPress();nodes=render();nodes.find(n=>n.props?.accessibilityRole==='tab'&&elements(n).some(t=>t.props?.children==='Más recientes')).props.onPress();nodes=render();assert.equal(nodes.find(n=>n.type==='Pagination').props.page,1);assert.ok(nodes.some(n=>n.props?.accessibilityLabel==='Revisar solicitud de Persona 10'));assert.equal(nodes.some(n=>n.props?.accessibilityLabel?.startsWith('Aceptar solicitud de')),false);
   nodes.find(n=>n.type==='Pagination').props.onPageChange(2);render();props.requests=all.slice(0,9);assert.equal(render().some(n=>n.type==='Pagination'),false);props.requests=all;assert.equal(render().find(n=>n.type==='Pagination').props.page,1);
  }
  props.loading=true;nodes=render();assert.ok(nodes.some(n=>n.type===ui.ResourceRequestsSkeleton));assert.equal(nodes.find(n=>n.type==='StepModal').props.refresh.enabled,false);h.unmount();
 }
});

test('received API requests resource pagination while sent requests keep individual pagination',()=>{
 const calls=[];const {loadPhysicalgoodsRequests}=load('physicalgoods/api/physicalgoodsApi.ts',{'@/lib/api/authenticated-request':{authenticatedEnvelopeRequest:(...args)=>calls.push(args)}});
 const signal=new AbortController().signal;loadPhysicalgoodsRequests(2,true,signal);loadPhysicalgoodsRequests(3,false,signal);
 assert.match(calls[0][0],/received-requests$/);assert.equal(calls[0][1].signal,signal);assert.equal(calls[0][2].get('groupBy'),'publication');assert.equal(calls[0][2].get('page'),'2');
 assert.match(calls[1][0],/sent-requests$/);assert.equal(calls[1][2].has('groupBy'),false);assert.equal(calls[1][2].get('page'),'3');
 loadPhysicalgoodsRequests(1,true,signal,'selected-publication');assert.equal(calls[2][2].get('publicationId'),'selected-publication');
});

test('physical badges use independent totals while the selected list is loading or fails',()=>{
 const calls=[];let refresh;
 const state={page:{data:[sentRow(),{...sentRow('accepted'),status:'ACEPTADA',transaction:{id:'tx1',status:'RESERVADA'}},{...sentRow('done'),status:'ACEPTADA',transaction:{id:'tx2',status:'COMPLETADA'}}],meta:{hasMore:false}},number:1,loading:false,busy:false,reload:noop};
 state.reload=()=>calls.push('list');
 const counters={counts:{sentAccepted:3,receivedPending:12},loading:false,reload:()=>calls.push('counts')};
 const {PhysicalgoodsRequests}=load('physicalgoods/components/PhysicalgoodsRequests.tsx',{'react/jsx-runtime':jsx,react:{useCallback:fn=>fn},'react-native':native,'../hooks/usePhysicalgoodsRequestCounts':{usePhysicalgoodsRequestCounts:()=>counters},'../hooks/usePhysicalgoodsRequests':{usePhysicalgoodsRequests:()=>state},'./PhysicalgoodsReceivedRequests':{PhysicalgoodsReceivedRequests:'Received'},'./PhysicalgoodsSentRequests':{PhysicalgoodsSentRequests:'Sent'},'@/components/RefreshScrollView':{useScrollRefresh:callback=>{refresh=callback;}},'../../components/ResourceDetailUI':{detailUI:{}},'../../components/RequestsUI':requestsUI});
 const nodes=elements(PhysicalgoodsRequests({active:true,onResolved:noop,onDetail:noop,onAgreement:noop,onModeChange:noop}));
 const tabs=nodes.find(n=>n.type==='RequestSegments');assert.equal(tabs.props.pendingCount,12);assert.equal(tabs.props.acceptedCount,3);assert.equal(tabs.props.showPendingSummary,false);assert.equal(tabs.props.pendingCountLabel,'pendientes');
 refresh();assert.deepEqual(calls,['counts','list']);
 state.loading=true;state.page=null;state.error='Sin conexión';
 for(const received of [true,false]){const button=elements(PhysicalgoodsRequests({active:true,received,onResolved:noop,onDetail:noop,onAgreement:noop,onModeChange:noop})).find(n=>n.type==='RequestSegments');assert.equal(button.props.pendingCount,12);assert.equal(button.props.acceptedCount,3);}
});

test('shared confirmation describes physical reservation and digital independent agreements; network errors never look empty',()=>{
  const {RequestDecisionDialog,RequestsFeedback,RequestsPager,RequestSegments}=load('components/RequestsUI.tsx',{'@/components/Skeleton':{Skeleton:'Skeleton',SkeletonBlock:'Block'},'react/jsx-runtime':jsx,'react-native':native,
    'lucide-react-native':{Inbox:'Icon',RefreshCw:'Icon',UserRound:'Icon'},'./CatalogUI':{CATALOG_COLORS:{},StatusTag:'Status',ui:{}},'./ResourceDetailUI':{detailUI:{}},'./PersonalUI':{personalStatusLabel:value=>value,PersonalSkeleton:'Skeleton',PersonalEmpty:'Empty',personalUI:{}}});
  assert.equal(RequestsPager({page:1,hasMore:false,disabled:false,onPrevious:noop,onNext:noop}),null);assert.ok(RequestsPager({page:2,hasMore:false,disabled:false,onPrevious:noop,onNext:noop}));
  const selection={name:'Diego',title:'Guía',decision:'ACEPTAR'};
  const physical=JSON.stringify(elements(RequestDecisionDialog({selection,physical:true,disabled:false,onConfirm:noop,onCancel:noop})));
  const digital=JSON.stringify(elements(RequestDecisionDialog({selection,disabled:false,onConfirm:noop,onCancel:noop})));
  assert.match(physical,/reservado/);assert.match(digital,/seguirá disponible/);assert.doesNotMatch(digital,/reservado/);
  const error=JSON.stringify(elements(RequestsFeedback({loading:false,error:'Sin conexión',empty:true,received:true,onReload:noop})));
  assert.match(error,/Sin conexión/);assert.match(error,/Reintentar consulta/);assert.doesNotMatch(error,/Aún no hay/);
  const tabs=JSON.stringify(elements(RequestSegments({received:true,onChange:noop,pendingCount:1,showPendingSummary:false,pendingCountLabel:'solicitudes por responder'})));assert.doesNotMatch(tabs,/en esta página/);assert.match(tabs,/1 solicitudes por responder/);
  const both=JSON.stringify(elements(RequestSegments({received:false,onChange:noop,pendingCount:12,acceptedCount:3,showPendingSummary:false})));assert.match(both,/Enviadas, 3 solicitudes aceptadas/);assert.match(both,/Recibidas, 12/);
  const waiting=JSON.stringify(elements(RequestSegments({received:false,onChange:noop,countsLoading:true,showPendingSummary:false})));assert.match(waiting,/Cargando contador de enviadas/);assert.match(waiting,/Cargando contador de recibidas/);
});

test('digital inbox tabs allow leaving a loading query but protect a decision being confirmed or saved',()=>{
  const modes=[],state={received:false,loading:true,busy:false,selection:null,rows:[],page:1,mode:value=>modes.push(value)};
  const {DigitalRequests}=load('elibrary/components/DigitalRequests.tsx',{'react/jsx-runtime':jsx,'react-native':native,
    '../../components/CatalogUI':{ui:{}},'../../components/ResourceDetailUI':{detailUI:{}},'../../components/RequestsUI':requestsUI});
  const tabs=()=>elements(DigitalRequests({state})).filter(n=>n.type==='Button'&&n.props.accessibilityRole==='tab');
  assert.ok(tabs().every(n=>!n.props.disabled));tabs()[1].props.onPress();assert.deepEqual(modes,[true]);
  state.busy=true;assert.ok(tabs().every(n=>n.props.disabled));state.busy=false;
  state.selection={request:digitalRow(),decision:'ACEPTAR'};assert.ok(tabs().every(n=>n.props.disabled));
});
