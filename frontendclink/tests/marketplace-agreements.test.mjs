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
  vm.runInNewContext(code, { module, exports: module.exports, AbortController, setTimeout, clearTimeout, require(name) {
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
const elements = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children, node.props?.overlay].flat(4).flatMap(elements)];
const noop = () => {};

class AuthApiError extends Error {}
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};

const presentation=load('utils/agreementPresentation.ts',{});
const copy=presentation.agreementCopy;
const agreement=(overrides={})=>({id:'trade',publication:{id:'pub',title:'Calculadora',status:'RESERVADO',isWithdrawn:false},campus:{id:'campus',name:'Campus'},role:'PROPIETARIO',modality:'VENTA',amount:1000,currency:'CLP',status:'RESERVADA',owner:{id:'owner',fullName:'Camila'},receiver:{id:'receiver',fullName:'Diego'},confirmations:[],startedAt:'2026-10-20T12:00:00Z',completedAt:null,cancelledAt:null,canConfirm:true,canCancel:true,...overrides});
const confirmed=(userId,role)=>({userId,role,confirmedAt:'2026-10-24T12:00:00Z'});
const native={View:'View',Text:'Text',Pressable:'Button',StyleSheet:{create:value=>value}};
const uiDeps=h=>({react:h.react,'react/jsx-runtime':jsx,'react-native':native,'lucide-react-native':{ArrowLeft:'Icon',Check:'Check',ChevronDown:'Down',ChevronRight:'Right',MoreHorizontal:'More'},'./CatalogUI':{CATALOG_COLORS:{},FilterSheet:'Sheet',ui:{}},'./ResourceDetailUI':{detailUI:{},DetailActionBar:'Footer'},'./AgreementProductUI':{AgreementParticipants:'Participants'},'@/components/Skeleton':{Skeleton:'Skeleton',SkeletonBlock:'Block'},'./TransactionRating':{TransactionRating:'Rating'},'./TransactionUI':{transactionDate:value=>value},'../utils/agreementPresentation':presentation});

test('derived states match confirmations by ID and role and prioritize canonical terminal states',()=>{
 const view=presentation.agreementPresentation;
 assert.equal(view(agreement()).state,'COORDINANDO');
 assert.equal(view(agreement({confirmations:[confirmed('receiver','RECEPTOR')]})).state,'ESPERANDO_TU_CONFIRMACION');
 assert.equal(view(agreement({confirmations:[confirmed('owner','PROPIETARIO')]})).state,'ESPERANDO_OTRO');
 assert.equal(view(agreement({role:'RECEPTOR',confirmations:[confirmed('owner','PROPIETARIO')]})).state,'ESPERANDO_TU_CONFIRMACION');
 assert.equal(view(agreement({confirmations:[confirmed('owner','RECEPTOR'),confirmed('stranger','PROPIETARIO')]})).confirmedCount,0);
 assert.equal(view(agreement({confirmations:[confirmed('owner','PROPIETARIO'),confirmed('owner','PROPIETARIO')]})).confirmedCount,1);
 assert.equal(view(agreement({status:'COMPLETADA'})).state,'FINALIZADO');assert.equal(view(agreement({status:'CANCELADA'})).state,'CANCELADO');
 assert.equal(view(agreement()).roleLabel,'Vendes a Diego');assert.equal(view(agreement({role:'RECEPTOR'})).roleLabel,'Compras a Camila');
 assert.equal(view(agreement({modality:'DONACION'})).roleLabel,'Donas a Diego');
});

test('agreement card exposes sibling step and options actions without a detail navigation target',()=>{
 const h=runtime(),ui=load('components/AgreementUI.tsx',{...uiDeps(h),'./AgreementProductUI':{AgreementParticipants:'Participants'}}),calls=[];
 const participants=[{id:'owner',name:'Camila',role:'PROPIETARIO'},{id:'receiver',name:'Diego',role:'RECEPTOR'}];
 const nodes=elements(ui.AgreementCard({title:'Libro',roleLabel:'Vendes a Diego',participants,modality:'VENTA',amount:1000,currency:'CLP',state:'COORDINANDO',label:copy.coordinating,dateLabel:'Hoy',onSelect:step=>calls.push(step),onMenu:()=>calls.push('menu')}));
 assert.equal(nodes[0].type,'View');assert.equal(nodes[0].props.onPress,undefined);assert.equal(nodes.filter(node=>node.type==='Button').length,1);nodes.find(node=>node.type==='Button').props.onPress();
 const progress=nodes.find(node=>node.type===ui.AgreementStepper),steps=elements(ui.AgreementStepper(progress.props)).filter(node=>node.type==='Button');
 assert.equal(steps.length,3);steps.forEach(step=>step.props.onPress());assert.deepEqual(calls,['menu','accepted','coordinate','confirm']);assert.ok(!nodes.some(node=>node.props.pointerEvents==='none'));
 const props={...agreement(),participants,currentUserId:'owner'};
 const summary=ui.AgreementSummary(props);assert.equal(summary.type,'Participants');assert.equal(summary.props.participants,participants);assert.equal(summary.props.donation,false);
 const amount=summary.props.children.type(summary.props.children.props);
 assert.equal(summary.props.currentUserId,'owner');assert.match(JSON.stringify(amount),/Monto acordado:.*1\.000 CLP/);assert.doesNotMatch(JSON.stringify(summary),/Vendes a|Coordinando entrega|Condiciones originales/);assert.equal(elements(summary).filter(node=>node.type==='Button').length,0);
 const donation=ui.AgreementSummary({...props,modality:'DONACION',amount:null});assert.equal(donation.props.donation,true);assert.match(JSON.stringify(donation.props.children.type(donation.props.children.props)),/Donación/);h.unmount();
});

test('CTA preserves confirmation before sending location and disables waiting/terminal/history without new rules',()=>{
 const h=runtime(),{AgreementActionBar,AgreementStepper}=load('components/AgreementUI.tsx',uiDeps(h));
 const props={view:presentation.agreementPresentation(agreement()),canConfirm:true,readOnly:false,busy:false,disabled:false,onConfirm:noop};
 assert.equal(AgreementActionBar(props).props.disabled,false);
 assert.equal(AgreementActionBar({...props,view:presentation.agreementPresentation(agreement({confirmations:[confirmed('owner','PROPIETARIO')]}))}).props.disabled,true);
 assert.equal(AgreementStepper({state:'CANCELADO'}),null);assert.equal(AgreementActionBar({...props,readOnly:true}),null);assert.equal(AgreementActionBar({...props,view:presentation.agreementPresentation(agreement({status:'COMPLETADA'}))}),null);
});

function metadataFixture(){
 const h=runtime(),reads=[];let rows=Array.from({length:5},(_,i)=>({...agreement(),id:String(i)})),enabled=true,live=0,peak=0,identity={userId:'owner',campusId:'campus'};
 const {usePhysicalgoodsAgreementPage}=load('physicalgoods/hooks/usePhysicalgoodsAgreementPage.ts',{react:h.react,'@/features/auth/hooks/useAuth':{useAuth:()=>({identity,refreshIdentity:noop})},'@/lib/api/authenticated-request':{AuthApiError},'../api/physicalgoodsApi':{loadPhysicalgoodsTransaction:(target,signal)=>{const job=deferred();reads.push({...job,target,signal});live++;peak=Math.max(peak,live);return job.promise.finally(()=>live--);}}});
 return{h,reads,get peak(){return peak;},disable:()=>enabled=false,setIdentity:value=>identity=value,render:()=>h.render(()=>usePhysicalgoodsAgreementPage(rows,enabled))};
}

async function readyMetadata(q){q.render();for(const read of q.reads.slice(0,3))read.resolve(agreement({id:read.target.transactionId}));await setImmediate();for(const read of q.reads.slice(3))read.resolve(agreement({id:read.target.transactionId}));await setImmediate();return q.render();}

test('a targeted refresh retains siblings and updates only its authorized transaction without a page loader',async()=>{
 const q=metadataFixture();let state=await readyMetadata(q);const sibling=state.details['1'],count=q.reads.length;
 await state.refresh('wrong','0');assert.equal(q.reads.length,count);
 const pending=state.refresh('pub','0');state=q.render();assert.equal(state.loading,false);assert.equal(Object.keys(state.details).length,5);assert.equal(q.reads.length,count+1);
 q.reads.at(-1).resolve(agreement({id:'0',status:'COMPLETADA',canCancel:false}));await pending;state=q.render();assert.equal(state.details['0'].status,'COMPLETADA');assert.equal(state.details['1'],sibling);
 state.update(agreement({id:'1',confirmations:[confirmed('receiver','RECEPTOR')]}));state=q.render();assert.equal(state.details['1'].confirmations.length,1);assert.equal(q.reads.length,count+1);
 const valid=state.details['1'];state.update(agreement({id:'1',publication:{id:'wrong'},status:'CANCELADA'}));state.update(agreement({id:'1',owner:{id:'stranger',fullName:'Ajeno'}}));assert.equal(q.render().details['1'],valid);state.invalidate('wrong','1');assert.equal(q.render().details['1'],valid);state.invalidate('pub','1');state=q.render();assert.equal(state.details['1'],undefined);assert.ok(state.failed.includes('1'));assert.ok(state.details['0']);q.h.unmount();
});

test('targeted cache reads abort on identity changes and a forbidden read removes the cached detail',async()=>{
 const q=metadataFixture();let state=await readyMetadata(q);let pending=state.refresh('pub','0');const read=q.reads.at(-1);
 q.setIdentity({userId:'another',campusId:'campus'});assert.equal(Object.keys(q.render().details).length,0);assert.equal(read.signal.aborted,true);read.resolve(agreement({id:'0'}));await pending;assert.equal(Object.keys(q.render().details).length,0);q.h.unmount();
 const other=metadataFixture();state=await readyMetadata(other);pending=state.refresh('pub','0');const denied=new AuthApiError('Forbidden');denied.status=403;other.reads.at(-1).reject(denied);await pending;state=other.render();assert.equal(state.details['0'],undefined);assert.ok(state.details['1']);assert.ok(state.failed.includes('0'));other.h.unmount();
});

test('page metadata caps concurrency at three, isolates failures and aborts stale results when hidden',async()=>{
 const q=metadataFixture();q.render();assert.equal(q.reads.length,3);
 q.reads[0].resolve(agreement({id:'0'}));q.reads[1].reject(new Error('network'));await setImmediate();assert.equal(q.reads.length,5);assert.equal(q.peak,3);
 for(const row of q.reads.slice(2))row.resolve(agreement({id:row.target.transactionId}));await setImmediate();let state=q.render();assert.equal(state.loading,false);assert.equal(Object.keys(state.details).length,4);assert.deepEqual(Array.from(state.failed),['1']);
 state.reload();q.render();const pending=q.reads.slice(5);q.disable();q.render();assert.ok(pending.every(row=>row.signal.aborted));for(const row of pending)row.resolve(agreement());await setImmediate();assert.deepEqual(Object.keys(q.render().details),[]);q.h.unmount();
});

test('origin request lookup paginates only own inbox and matches both transaction and publication',async()=>{
 const calls=[];const {findAgreementRequest}=load('physicalgoods/api/findAgreementRequest.ts',{'./physicalgoodsApi':{loadPhysicalgoodsRequests:async(page,received,signal)=>{calls.push({page,received,signal});return page===1?{data:[{id:'wrong',publication:{id:'pub'},transaction:{id:'other'}}],meta:{hasMore:true}}:{data:[{id:'exact',publication:{id:'pub'},transaction:{id:'trade'}}],meta:{hasMore:false}};}}});
 const abort=new AbortController(),result=await findAgreementRequest({publicationId:'pub',transactionId:'trade'},false,abort.signal);
 assert.equal(result.requestId,'exact');assert.deepEqual(calls.map(row=>row.page),[1,2]);assert.ok(calls.every(row=>row.received===false));abort.abort();assert.equal(await findAgreementRequest({publicationId:'pub',transactionId:'trade'},true,abort.signal),null);assert.equal(calls.length,2);
});

function listFixture(){
 const h=runtime(),opened=[],registered=[];const data=[agreement(),agreement({id:'needs',confirmations:[confirmed('receiver','RECEPTOR')]}),agreement({id:'wait',confirmations:[confirmed('owner','PROPIETARIO')]}),agreement({id:'done',status:'COMPLETADA',completedAt:'2026-10-24T12:00:00Z'}),agreement({id:'cancel',status:'CANCELADA',cancelledAt:'2026-10-23T12:00:00Z'})];
 const stats={reloads:0,refreshes:[],updates:[],invalidated:[]};
 const history={page:{data,meta:{hasMore:false,total:3,totalPages:1,counts:{active:3,finished:2}}},number:1,tab:'active',loading:false,error:null,reload:()=>stats.reloads++,refreshCurrent:noop,setTab:value=>{history.tab=value;history.number=1;},setNumber:value=>{history.number=value;}};const meta={details:Object.fromEntries(data.map(row=>[row.id,row])),scope:'owner:campus',campusId:'campus',failed:[],loading:false,reload:noop,refresh:(...args)=>stats.refreshes.push(args),update:value=>stats.updates.push(value),invalidate:(...args)=>stats.invalidated.push(args)};
 const {PhysicalgoodsAgreements}=load('physicalgoods/components/PhysicalgoodsAgreements.tsx',{react:h.react,'react/jsx-runtime':jsx,'react-native':native,'@/components/RefreshScrollView':{useScrollRefresh:(...args)=>registered.push(args)},'../hooks/usePhysicalgoodsTransactions':{usePhysicalgoodsTransactions:()=>history,TRANSACTIONS_PAGE_SIZE:5},'@/components/Pagination':{Pagination:'Pagination'},'../hooks/usePhysicalgoodsAgreementPage':{usePhysicalgoodsAgreementPage:()=>meta},'../../components/AgreementUI':{AgreementCard:'Card',AgreementCardsSkeleton:'Skeleton',AgreementTabs:'Tabs',AgreementListSection:'Section'},'./PhysicalgoodsTransaction':{PhysicalgoodsTransaction:'Panels'},'../../components/RequestsUI':{RequestsPager:'Pager',RequestButton:'Action'},'../../components/PersonalUI':{PersonalEmpty:'Empty',PersonalSkeleton:'Skeleton'},'../../components/CatalogUI':{CATALOG_COLORS:{},ui:{}},'../../components/ResourceDetailUI':{detailUI:{}},'../../utils/agreementPresentation':presentation});
 return{h,history,meta,stats,registered,opened,render:(refreshEnabled=true,extra={})=>elements(h.render(()=>PhysicalgoodsAgreements({active:true,refreshVersion:0,refreshEnabled,onExplore:noop,onAgreement:(...args)=>opened.push(args),...extra})))};
}

test('list groups and counts its page, opens exact inline panels and preserves terminal sorting',()=>{
 const q=listFixture();let nodes=q.render();assert.deepEqual(nodes.filter(row=>row.type==='Card').map(row=>row.props.state),['COORDINANDO','ESPERANDO_TU_CONFIRMACION','ESPERANDO_OTRO']);
 assert.doesNotMatch(JSON.stringify(nodes),/Acuerdos de esta página|Ver finalizados/);
 assert.equal(nodes.find(row=>row.type==='Card').props.currentUserId,'owner');assert.deepEqual(Array.from(nodes.find(row=>row.type==='Card').props.participants,person=>person.name),['Camila','Diego']);assert.equal(nodes.find(row=>row.type==='Card').props.amount,1000);
 assert.equal(q.registered.at(-1)[0],q.history.reload);assert.equal(q.registered.at(-1)[2],true);q.render(false);assert.equal(q.registered.at(-1)[2],false);
 for(const entry of ['accepted','coordinate','confirm','menu']){
  nodes=q.render();const card=nodes.find(row=>row.type==='Card');if(entry==='menu')card.props.onMenu();else card.props.onSelect(entry);
  nodes=q.render();const controller=nodes.find(row=>row.type==='Panels');assert.equal(controller.props.panelsOnly,true);assert.equal(controller.props.initialPanel,entry);assert.deepEqual({...controller.props.target},{publicationId:'pub',transactionId:'trade'});assert.equal(controller.props.initialDetail,q.meta.details.trade);assert.equal(controller.props.initialHistorical,false);assert.equal(q.registered.at(-1)[2],false);assert.ok(!nodes.some(row=>row.type==='Skeleton'));
  if(entry==='confirm'){controller.props.onChanged();assert.deepEqual(q.stats.refreshes,[['pub','trade']]);controller.props.onDetailChanged(q.meta.details.trade);assert.equal(q.stats.updates.length,1);controller.props.onAccessDenied();assert.deepEqual(q.stats.invalidated,[['pub','trade']]);}controller.props.onClose();assert.equal(q.stats.reloads,0);
 }
 assert.deepEqual(q.opened,[]);nodes=q.render();
 nodes.find(row=>row.type==='Tabs').props.onSelect('finished');nodes=q.render();assert.deepEqual(nodes.filter(row=>row.type==='Card').map(row=>row.props.state),['FINALIZADO','CANCELADO']);
 assert.ok(nodes.filter(row=>row.type==='Card').every(row=>!row.props.next));assert.ok(!nodes.some(row=>row.type==='Pagination'));q.h.unmount();
});

test('transaction pagination uses the selected tab total including exactly five and a partial last page',()=>{
 const q=listFixture();q.history.page.meta.counts={active:4,finished:8};assert.ok(!q.render().some(row=>row.type==='Pagination'));
 q.history.page.meta.counts.active=5;let nodes=q.render(),pager=nodes.find(row=>row.type==='Pagination');assert.equal(pager.props.totalPages,1);assert.equal(pager.props.showSinglePage,true);assert.match(pager.props.label,/activas/);
 q.history.page.meta.counts.active=6;nodes=q.render();pager=nodes.find(row=>row.type==='Pagination');assert.equal(pager.props.totalPages,2);pager.props.onPageChange(2);assert.equal(q.history.number,2);
 q.history.page.data=[q.history.page.data[0]];nodes=q.render();assert.equal(nodes.filter(row=>row.type==='Card').length,1);assert.equal(nodes.find(row=>row.type==='Pagination').props.page,2);
 nodes.find(row=>row.type==='Tabs').props.onSelect('finished');q.history.page.meta.counts.finished=5;nodes=q.render();assert.equal(q.history.number,1);assert.match(nodes.find(row=>row.type==='Pagination').props.label,/finalizadas/);
 q.history.loading=true;assert.ok(!q.render().some(row=>row.type==='Pagination'));q.history.loading=false;q.history.error='offline';assert.ok(!q.render().some(row=>row.type==='Pagination'));q.h.unmount();
});

test('activity counters refresh on request, and a changed transaction detail, without reloading the list on consultation',()=>{
 const q=listFixture();let countReads=0;const extra={onActivityRefresh:()=>countReads++};
 let nodes=q.render(true,extra);q.registered.at(-1)[0]();assert.equal(countReads,1);assert.equal(q.stats.reloads,1);
 nodes.find(row=>row.type==='Card').props.onSelect('confirm');nodes=q.render(true,extra);
 const modal=nodes.find(row=>row.type==='Panels');modal.props.onDetailChanged(q.meta.details.trade);assert.equal(countReads,1);
 modal.props.onDetailChanged({...q.meta.details.trade,status:'COMPLETADA'});assert.equal(countReads,2);assert.equal(q.stats.reloads,1);
 modal.props.onClose();q.render(true,extra);assert.equal(q.stats.reloads,1);q.h.unmount();
});

test('a transaction changing tabs reconciles only after its modal closes, not after ordinary consultation',()=>{
 const q=listFixture();let refreshes=0;q.history.refreshCurrent=()=>refreshes++;let nodes=q.render();nodes.find(row=>row.type==='Card').props.onSelect('confirm');q.render();q.meta.details.trade={...q.meta.details.trade,status:'COMPLETADA',canConfirm:false,canCancel:false};nodes=q.render();assert.equal(refreshes,0);nodes.find(row=>row.type==='Panels').props.onClose();q.render();assert.equal(refreshes,1);assert.equal(q.stats.reloads,0);q.h.unmount();
});

function transactionPagesFixture(){
 const h=runtime(),reads=[];let identity={userId:'owner',campusId:'campus'},active=true,version=0,refreshed=0;
 const {usePhysicalgoodsTransactions}=load('physicalgoods/hooks/usePhysicalgoodsTransactions.ts',{react:h.react,'@/features/auth/hooks/useAuth':{useAuth:()=>({identity,refreshIdentity:()=>refreshed++})},'@/lib/api/authenticated-request':{AuthApiError},'../api/physicalgoodsApi':{loadPhysicalgoodsTransactionsPage:(...args)=>{const request=deferred();reads.push({...request,args});return request.promise;}}});
 return{h,reads,render:()=>h.render(()=>usePhysicalgoodsTransactions(active,version)),move:()=>{identity={userId:'other',campusId:'other-campus'};},setActive:value=>{active=value;},refresh:()=>version++,get refreshed(){return refreshed;}};
}
const transactionPage=(tab,number=1,total=6)=>({data:[agreement({id:`${tab}-${number}`,status:tab==='active'?'RESERVADA':'COMPLETADA'})],meta:{page:number,limit:5,total,totalPages:Math.max(1,Math.ceil(total/5)),hasMore:number*5<total,counts:{active:6,finished:6}}});
test('tab pagination resets pages on tab/refresh/context changes and discards obsolete responses',async()=>{
 const q=transactionPagesFixture();q.render();assert.deepEqual(q.reads[0].args.slice(0,2),[1,'active']);q.reads[0].resolve(transactionPage('active'));await setImmediate();let state=q.render();state.setNumber(2);q.render();state=q.render();assert.equal(state.page,null);const obsolete=q.reads.at(-1);assert.deepEqual(obsolete.args.slice(0,2),[2,'active']);
 state.setTab('finished');q.render();assert.equal(obsolete.args[2].aborted,true);const current=q.reads.at(-1);assert.deepEqual(current.args.slice(0,2),[1,'finished']);obsolete.resolve(transactionPage('active',2));current.resolve(transactionPage('finished'));await setImmediate();state=q.render();assert.equal(state.page.data[0].id,'finished-1');
 state.setNumber(2);q.render();q.reads.at(-1).resolve(transactionPage('finished',2));await setImmediate();state=q.render();assert.equal(state.number,2);state.reload();q.render();assert.deepEqual(q.reads.at(-1).args.slice(0,2),[1,'finished']);q.reads.at(-1).resolve(transactionPage('finished'));await setImmediate();state=q.render();
 state.setNumber(2);q.render();const old=q.reads.at(-1);q.move();state=q.render();assert.equal(state.page,null);assert.equal(state.tab,'active');assert.equal(state.number,1);assert.equal(old.args[2].aborted,true);q.setActive(false);q.render();assert.equal(q.reads.at(-1).args[2].aborted,true);q.h.unmount();
});
test('tab pagination clamps removed last pages and exposes retryable errors without stale data',async()=>{
 const q=transactionPagesFixture();q.render();q.reads[0].resolve(transactionPage('active',1,11));await setImmediate();let state=q.render();state.setNumber(3);q.render();q.reads.at(-1).resolve(transactionPage('active',3,6));await setImmediate();state=q.render();assert.equal(state.number,2);assert.equal(state.page,null);q.reads.at(-1).reject(new Error('offline'));await setImmediate();state=q.render();assert.ok(state.error);assert.equal(state.loading,false);state.reload();q.render();assert.equal(q.reads.at(-1).args[0],1);q.h.unmount();
});

test('partial metadata errors never invent a counterpart or confirmation state',()=>{
 const q=listFixture();delete q.meta.details.trade;q.meta.failed.push('trade');const nodes=q.render();const card=nodes.find(row=>row.type==='Card'&&row.props.label===copy.unknown);
 assert.ok(card);assert.equal(card.props.state,undefined);assert.equal(card.props.roleLabel,copy.seller);assert.equal(card.props.participants,undefined);assert.equal(card.props.currentUserId,undefined);assert.match(JSON.stringify(nodes),/No pudimos consultar/);q.h.unmount();
});

function physicalDetailFixture(options={}){
 const h=runtime(),calls=[],polling=[],state={detail:agreement(),loading:false,busy:false,messagesLoading:false,optionsLoading:false,historical:false,error:null,action:null,
  detailRefreshing:false,refreshDetail:noop,messagesRefreshing:false,refreshMessages:noop,cancelMessageRefresh:noop,cancelMessagePolling:noop,pollMessages:noop,reload:noop,poll:noop,selectAction:value=>state.action=value,cancelAction:()=>state.action=null,confirmExchange:()=>calls.push('confirm'),submitRating:()=>calls.push('rating'),confirm:()=>calls.push('confirm'),cancel:()=>calls.push('cancel')};
 const origin={request:null,loading:false,error:null,open:received=>calls.push(['origin',received]),close:noop};
 const {PhysicalgoodsTransaction}=load('physicalgoods/components/PhysicalgoodsTransaction.tsx',{react:h.react,'react/jsx-runtime':jsx,'react-native':{...native,Modal:'Modal'},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:20,bottom:20})},'@/components/RefreshScrollView':{RefreshScrollView:'Scroll'},'../../hooks/useAgreementPolling':{useAgreementPolling:(...args)=>polling.push(args),COORDINATION_MESSAGES_POLL_INTERVAL:7000},'../../components/AgreementStepModal':{AgreementStepModal:'StepModal'},'../../components/OwnerRating':{OwnerRating:'OwnerRating'},'lucide-react-native':{CheckCircle2:'SuccessIcon'},'../../components/RequestsUI':{RequestButton:'RequestButton'},'../../components/TransactionRating':{TransactionRating:'Rating'},'../../components/MarketplaceReportForm':{MarketplaceReportForm:'Report'},'../hooks/usePhysicalgoodsTransaction':{usePhysicalgoodsTransaction:()=>state},'../hooks/usePhysicalgoodsAgreementRequest':{usePhysicalgoodsAgreementRequest:()=>origin},'../../components/ResourceDetailUI':{AgreementNotice:'Notice',detailUI:{}},'../../components/CatalogUI':{CATALOG_COLORS:{}},'../../components/AgreementUI':{AgreementHeader:'Header',AgreementSummary:'Summary',AgreementMenu:'Menu',AgreementStepper:'Stepper',AgreementActionBar:'Footer',AgreementPanelSkeleton:'PanelSkeleton'},'../../utils/agreementPresentation':presentation,'../../components/TransactionUI':{TransactionConfirmations:'People',TransactionDecisionDialog:'Dialog',TransactionFeedback:'Feedback',transactionUI:{}},'./PhysicalgoodsCoordination':{PhysicalgoodsCoordination:'Coordination',PhysicalgoodsCoordinationMessages:'Messages'},'./PhysicalgoodsHistory':{PhysicalgoodsHistoryDetail:'History'},'./PhysicalgoodsAgreementProduct':{PhysicalgoodsAgreementProduct:'ProductModal'}});
 const render=(target={publicationId:'pub',transactionId:'trade'})=>elements(h.render(()=>PhysicalgoodsTransaction({target,onClose:noop,onChanged:noop,onOpen:id=>calls.push(id),...options})));
 return{h,calls,polling,state,origin,render};
}

test('physical detail menu keeps cancellation and reporting behind explicit decisions and exact callbacks',()=>{
 const {h,calls,state,render}=physicalDetailFixture();
 let nodes=render();const menu=nodes.find(row=>row.type==='Menu');assert.deepEqual(Array.from(menu.props.actions,row=>row.label),[copy.report,copy.cancel]);
 menu.props.actions[0].onPress();nodes=render();assert.ok(!nodes.some(row=>row.type==='Report'));nodes.find(row=>row.type==='Dialog').props.onCancel();assert.deepEqual(calls,[]);
 menu.props.actions[1].onPress();assert.ok(!calls.includes('cancel'));nodes=render();nodes.find(row=>row.type==='Dialog').props.onCancel();assert.ok(!calls.includes('cancel'));
 state.selectAction('confirm');nodes=render();nodes.find(row=>row.type==='Dialog').props.onConfirm();assert.ok(calls.includes('confirm'));
 state.action=null;state.detail.canCancel=false;nodes=render();assert.deepEqual(Array.from(nodes.find(row=>row.type==='Menu').props.actions,row=>row.label),[copy.report]);
 state.historical=true;nodes=render();assert.equal(nodes.find(row=>row.type==='Menu').props.actions.length,0);assert.equal(nodes.find(row=>row.type==='Header').props.menuDisabled,true);h.unmount();
});

test('inline step entries render only the requested panel, preserve message refresh and close to the list',()=>{
 for(const entry of ['accepted','coordinate','confirm']){
  let closed=0;const q=physicalDetailFixture({panelsOnly:true,initialPanel:entry,onClose:()=>closed++});let nodes=q.render();
  assert.ok(!nodes.some(row=>['Modal','Header','Stepper','Summary','Scroll'].includes(row.type)));
  if(entry==='accepted'){const product=nodes.find(row=>row.type==='ProductModal');assert.equal(product.props.detail.id,'trade');product.props.onClose();}
  else{const panel=nodes.find(row=>row.type==='StepModal');assert.equal(panel.props.title,entry==='coordinate'?copy.coordinationTitle('Calculadora'):copy.confirmStep);
   if(entry==='coordinate'){assert.equal(panel.props.refresh.onRefresh,q.state.refreshMessages);assert.ok(q.polling.some(args=>args[0]===q.state.pollMessages&&args[1]&&args[2]===7000));}
   else{nodes.find(row=>row.type==='Footer').props.onConfirm();nodes=q.render();assert.ok(q.calls.includes('confirm'));assert.equal(q.state.action,null);assert.equal(nodes.find(row=>row.type==='StepModal').props.overlay,undefined);}
   q.render().find(row=>row.type==='StepModal').props.onClose();
  }
  assert.equal(closed,1);q.h.unmount();
 }
});

test('inline menu protects loading and mismatched records, retries errors and enforces historical permissions',()=>{
 let closed=0;const q=physicalDetailFixture({panelsOnly:true,initialPanel:'menu',onClose:()=>closed++});q.state.detail=null;q.state.loading=true;let nodes=q.render();
 assert.ok(!nodes.some(row=>row.type==='Menu'));assert.equal(nodes.find(row=>row.type==='PanelSkeleton').props.panel,'menu');
 q.state.loading=false;q.state.error='No autorizado';nodes=q.render();assert.equal(nodes.find(row=>row.type==='Feedback').props.error,'No autorizado');assert.ok(!nodes.some(row=>row.type==='Menu'));
 q.state.error=null;q.state.detail=agreement({id:'another'});nodes=q.render();assert.equal(nodes.find(row=>row.type==='Feedback').props.error,copy.transactionUnavailable);
 q.state.detail=agreement();q.state.historical=true;nodes=q.render();assert.ok(!nodes.some(row=>row.type==='Menu'));assert.match(JSON.stringify(nodes),/No hay acciones disponibles/);
 nodes.find(row=>row.type==='StepModal').props.onClose();assert.equal(closed,1);q.h.unmount();
});

test('cached previews show the options skeleton with fixed bounds while revalidating and cannot authorize actions',()=>{
 let revoked=0;const updates=[],seed=agreement(),q=physicalDetailFixture({panelsOnly:true,initialPanel:'menu',initialDetail:seed,onDetailChanged:value=>updates.push(value),onAccessDenied:()=>revoked++});
 q.state.detail=null;q.state.loading=true;let nodes=q.render();assert.equal(nodes.find(row=>row.type==='StepModal').props.preferredHeight,420);assert.equal(nodes.find(row=>row.type==='PanelSkeleton').props.panel,'menu');assert.ok(!nodes.some(row=>row.type==='Menu'));
 assert.doesNotMatch(JSON.stringify(nodes),/Actualizando estado de la transacción/);
 const pending=renderCatalog('physical',{mode:'personal',inlinePanel:'menu',transactionState:'loading'}).markup;assert.match(pending,/Cargando transacción/);assert.doesNotMatch(pending,/Denunciar transacción|Cancelar transacción/);
 const fresh=agreement({status:'CANCELADA',canCancel:false,canConfirm:false});q.state.detail=fresh;q.state.loading=false;nodes=q.render();q.render();assert.equal(updates.length,1);assert.equal(updates[0],fresh);assert.equal(nodes.find(row=>row.type==='StepModal').props.preferredHeight,420);assert.deepEqual(Array.from(nodes.find(row=>row.type==='Menu').props.actions,row=>row.label),[copy.report]);
 q.state.accessDenied=true;q.state.detail=null;q.state.error='Forbidden';nodes=q.render();q.render();assert.ok(!nodes.some(row=>row.type==='Menu'));assert.equal(nodes.find(row=>row.type==='Feedback').props.error,'Forbidden');assert.equal(revoked,1);q.h.unmount();
 const cold=physicalDetailFixture({panelsOnly:true,initialPanel:'confirm'});cold.state.detail=null;cold.state.loading=true;const before=cold.render().find(row=>row.type==='StepModal');cold.state.detail=agreement();cold.state.loading=false;const after=cold.render().find(row=>row.type==='StepModal');assert.equal(before.props.preferredHeight,680);assert.equal(after.props.preferredHeight,680);cold.h.unmount();
});

test('coordination waits for its first sections without partial cards and keeps data during background refresh',()=>{
 const q=physicalDetailFixture({panelsOnly:true,initialPanel:'coordinate',initialDetail:agreement()});q.state.messages=null;q.state.options=null;q.state.messagesLoading=true;q.state.optionsLoading=true;
 let nodes=q.render();assert.ok(nodes.some(row=>row.type==='PanelSkeleton'));assert.ok(!nodes.some(row=>row.type==='Coordination'));
 q.state.messages={data:[],meta:{hasMore:false}};q.state.messagesLoading=false;nodes=q.render();assert.ok(nodes.some(row=>row.type==='PanelSkeleton'));
 q.state.options={buildings:[]};q.state.optionsLoading=false;nodes=q.render();assert.ok(nodes.some(row=>row.type==='Coordination'));assert.ok(!nodes.some(row=>row.type==='PanelSkeleton'));
 q.state.optionsLoading=true;q.state.messagesLoading=true;nodes=q.render();assert.ok(nodes.some(row=>row.type==='Coordination'));assert.ok(!nodes.some(row=>row.type==='PanelSkeleton'));q.h.unmount();
});

test('inline options retain cancellation decisions and report form without a detail page or premature writes',()=>{
 const q=physicalDetailFixture({panelsOnly:true,initialPanel:'menu'});let nodes=q.render();let menu=nodes.find(row=>row.type==='Menu');assert.equal(menu.props.visible,true);assert.deepEqual(Array.from(menu.props.actions,row=>row.label),[copy.report,copy.cancel]);
 menu.props.actions[1].onPress();nodes=q.render();assert.equal(nodes.find(row=>row.type==='Menu').props.visible,false);assert.ok(!q.calls.includes('cancel'));nodes.find(row=>row.type==='Dialog').props.onCancel();assert.equal(q.render().find(row=>row.type==='Menu').props.visible,true);
 q.render().find(row=>row.type==='Menu').props.actions[1].onPress();nodes=q.render();nodes.find(row=>row.type==='Dialog').props.onConfirm();assert.ok(q.calls.includes('cancel'));
 q.state.action=null;q.state.detail.canCancel=false;q.state.detail.status='CANCELADA';nodes=q.render();assert.deepEqual(Array.from(nodes.find(row=>row.type==='Menu').props.actions,row=>row.label),[copy.report]);
 nodes.find(row=>row.type==='Menu').props.actions[0].onPress();nodes=q.render();assert.ok(!nodes.some(row=>row.type==='Report'));nodes.find(row=>row.type==='Dialog').props.onConfirm();nodes=q.render();
 const form=nodes.find(row=>row.type==='Report');assert.deepEqual({...form.props.target},{type:'TRANSACCION',publicationId:'pub',transactionId:'trade'});assert.ok(!nodes.some(row=>row.type==='Modal'||row.type==='Header'));assert.equal(nodes.find(row=>row.type==='StepModal').props.title,copy.report);
 form.props.onBusyChange(true);nodes=q.render();assert.equal(nodes.find(row=>row.type==='StepModal').props.closeDisabled,true);form.props.onBusyChange(false);q.render().find(row=>row.type==='Report').props.onBack();assert.equal(q.render().find(row=>row.type==='Menu').props.visible,true);q.h.unmount();
});

test('real inline panels keep the transaction tab behind them and expose rating, loading and recovery without overview',()=>{
 for(const[entry,text]of [['accepted','Recurso de la transacción'],['coordinate','Coordinación para la entrega de'],['confirm','Confirmaciones · 0 de 2'],['menu','Denunciar transacción']]){
  const markup=renderCatalog('physical',{mode:'personal',variant:'transactions',inlinePanel:entry}).markup;
  assert.ok(markup.includes(text),text);assert.match(markup,/Mis transacciones/);assert.doesNotMatch(markup,/Transacción del recurso|Toca un paso para consultar/);assert.equal(markup.match(/data-qa-modal-portal=/g)?.length,1);
 }
 const loading=renderCatalog('physical',{mode:'personal',inlinePanel:'menu',state:'loading'}).markup;assert.match(loading,/Cargando transacción/);assert.doesNotMatch(loading,/Denunciar transacción|Cancelar transacción/);
 const error=renderCatalog('physical',{mode:'personal',inlinePanel:'menu',state:'error'}).markup;assert.match(error,/role="alert"/);assert.match(error,/Reintentar consulta/);assert.doesNotMatch(error,/Transacción del recurso/);
 const rating=renderCatalog('physical',{mode:'personal',inlinePanel:'confirm',variant:'rating',agreementTab:'finished'}).markup;assert.match(rating,/Valoración del propietario/);assert.match(rating,/Enviar valoración/);assert.doesNotMatch(rating,/Transacción del recurso/);
 const rated=renderCatalog('physical',{mode:'personal',inlinePanel:'confirm',variant:'rated',agreementTab:'finished'}).markup;assert.doesNotMatch(rated,/Valoración del propietario|Valoración registrada|Enviar valoración/);assert.match(rated,/Valoración de la transacción: 4 de 5 estrellas/);
 const decision=renderCatalog('physical',{mode:'personal',inlinePanel:'menu',variant:'cancel-dialog'}).markup;assert.match(decision,/Sí, cancelar/);assert.equal(decision.match(/data-qa-modal-portal=/g)?.length,1);
 const form=renderCatalog('physical',{mode:'personal',inlinePanel:'menu',variant:'report-form'}).markup;assert.match(form,/Motivos de la denuncia/);assert.match(form,/Enviar denuncia/);assert.equal(form.match(/data-qa-modal-portal=/g)?.length,1);
});

for(const variant of ['available','needs-confirmation','waiting','completed','cancelled'])test(`real agreement detail ${variant} keeps the payment notice before coordination and no manual messages refresh`,()=>{
 const markup=renderCatalog('physical',{mode:'transaction',variant,width:390}).markup;
 assert.match(markup,/CampusLink registra el acuerdo/);assert.doesNotMatch(markup,/Actualizar mensajes|Vendes a|Coordinando entrega/);for(const text of ['Participantes','Camila González','Diego Pérez','Vendedor','Comprador'])assert.ok(markup.includes(text),text);
 if(variant==='available'){
  assert.doesNotMatch(markup,/Dónde estás|Confirmaciones ·|Confirmar que se realizó/);
  const coordination=renderCatalog('physical',{mode:'transaction',agreementPanel:'coordinate',width:390}).markup;
  assert.ok(coordination.indexOf('CampusLink registra el acuerdo')<coordination.indexOf('Dónde estás'));
 }
 if(['needs-confirmation','waiting'].includes(variant)){
  assert.match(markup,/En curso/);
  const confirmations=renderCatalog('physical',{mode:'transaction',variant,agreementPanel:'confirm'}).markup;
  assert.match(confirmations,/Confirmaciones · 1 de 2/);
  assert.match(confirmations,variant==='waiting'?/Esperando a Diego Pérez/:/Confirmar que se realizó/);
 }
 if(variant==='completed'){assert.match(markup,/Listo/);assert.doesNotMatch(markup,/En curso/);}
 if(variant==='cancelled')assert.match(markup,/Cancelado/);
});

test('real list separates active and terminal groups and preserves no duplicate links',()=>{
 const markup=renderCatalog('physical',{mode:'transactions'}).markup;assert.match(markup,/Requiere tu acción|REQUIERE TU ACCIÓN/);assert.match(markup,/Esperando a Diego Pérez/);
 assert.doesNotMatch(markup,/Ver solicitud|Ver recurso/);assert.match(markup,/Activas/);
 for(const text of ['Mis transacciones','Participantes','Monto acordado:','Aceptada','Coordinar','Confirmar'])assert.ok(markup.includes(text),text);
 assert.match(markup,/<button[^>]*aria-label="(?:Aceptada|Coordinar|Confirmar)"/);assert.match(markup,/Opciones de transacción/);
 const loading=renderCatalog('physical',{mode:'personal',variant:'transactions',state:'loading'}).markup;assert.match(loading,/Mis transacciones/);assert.match(loading,/Cargando transacciones/);assert.doesNotMatch(loading,/Mis acuerdos|Cargando acuerdos/);
 const finished=renderCatalog('physical',{mode:'transactions',variant:'finished'}).markup;assert.match(finished,/Finalizado/);assert.match(finished,/Cancelado/);assert.doesNotMatch(finished,/Coordinando entrega/);
});

test('historical active agreements remain readable without promising unavailable actions',()=>{
 const q=listFixture();q.meta.details.trade={...q.meta.details.trade,canConfirm:false,canCancel:false};const nodes=q.render();const card=nodes.find(row=>row.type==='Card'&&row.props.title==='Calculadora');
 assert.ok(card);card.props.onSelect('coordinate');const panel=q.render().find(row=>row.type==='Panels');assert.equal(panel.props.initialPanel,'coordinate');assert.deepEqual(q.opened,[]);q.h.unmount();
});

test('step buttons reveal only their panel, product modal closes cleanly, and confirm uses one explicit submission',()=>{
 const q=physicalDetailFixture();let nodes=q.render();
 assert.ok(!nodes.some(row=>['Coordination','People','Footer','ProductModal'].includes(row.type)));
 nodes.find(row=>row.type==='Stepper').props.onSelect('coordinate');nodes=q.render();
 assert.ok(nodes.some(row=>row.type==='Coordination'));assert.ok(!nodes.some(row=>row.type==='People'));
 nodes.find(row=>row.type==='Stepper').props.onSelect('confirm');nodes=q.render();
 const people=nodes.find(row=>row.type==='People'),footer=nodes.find(row=>row.type==='Footer');
 assert.ok(elements(people).includes(footer));assert.equal(footer.props.inline,true);assert.ok(!nodes.some(row=>row.type==='Coordination'));
 assert.deepEqual(q.calls,[]);footer.props.onConfirm();assert.equal(q.state.action,null);assert.deepEqual(q.calls,['confirm']);
 nodes=q.render();nodes.find(row=>row.type==='Stepper').props.onSelect('accepted');nodes=q.render();
 assert.ok(nodes.some(row=>row.type==='ProductModal'));assert.equal(nodes.find(row=>row.type==='Scroll').props.refreshEnabled,false);
 nodes.find(row=>row.type==='ProductModal').props.onClose();nodes=q.render();assert.ok(!nodes.some(row=>row.type==='ProductModal'));assert.equal(nodes.find(row=>row.type==='Scroll').props.refreshEnabled,true);
 q.state.historical=true;q.state.detail.canCancel=false;
 nodes.find(row=>row.type==='Stepper').props.onSelect('coordinate');nodes=q.render();assert.ok(nodes.some(row=>row.type==='Messages'));assert.ok(!nodes.some(row=>row.type==='Coordination'));assert.equal(q.polling.at(-1)[1],true);
 nodes.find(row=>row.type==='Stepper').props.onSelect('confirm');nodes=q.render();assert.equal(nodes.find(row=>row.type==='Footer').props.readOnly,true);q.h.unmount();
});

test('shared stepper exposes three accessible buttons and preserves cancelled history consultation',()=>{
 const h=runtime(),{AgreementStepper}=load('components/AgreementUI.tsx',uiDeps(h)),calls=[];
 const nodes=elements(AgreementStepper({state:'COORDINANDO',selected:'confirm',onSelect:value=>calls.push(value)}));
 const buttons=nodes.filter(row=>row.type==='Button');assert.deepEqual(buttons.map(row=>row.props.accessibilityLabel),[copy.acceptedStep,copy.coordinateStep,copy.confirmStep]);
 assert.equal(buttons[2].props.accessibilityState.selected,true);buttons.forEach(row=>row.props.onPress());assert.deepEqual(calls,['accepted','coordinate','confirm']);
 assert.equal(elements(AgreementStepper({state:'CANCELADO',onSelect:noop})).filter(row=>row.type==='Button').length,3);
 assert.ok(elements(AgreementStepper({state:'FINALIZADO',onSelect:noop,disabled:true})).filter(row=>row.type==='Button').every(row=>row.props.disabled));h.unmount();
});

function productFixture(detail=agreement(),historical=false){
 const h=runtime(),reads=[];let refreshed=0;
 const read=source=>(id,signal)=>{const job=deferred();reads.push({...job,source,id,signal});return job.promise;};
 const {usePhysicalgoodsAgreementProduct}=load('physicalgoods/hooks/usePhysicalgoodsAgreementProduct.ts',{
  react:h.react,'@/features/auth/hooks/useAuth':{useAuth:()=>({identity:{userId:detail.role==='PROPIETARIO'?'owner':'receiver',campusId:historical?'new':'campus'},refreshIdentity:()=>refreshed++})},
  '@/lib/api/authenticated-request':{AuthApiError},'../api/physicalgoodsApi':{loadOwnPhysicalgoodsDetail:read('own'),loadPhysicalgoodsGallery:read('public')},'../../utils/agreementPresentation':presentation,
 });
 return{h,reads,get refreshed(){return refreshed;},render:()=>h.render(()=>usePhysicalgoodsAgreementProduct(detail,historical))};
}
const product={id:'pub',description:'Producto vigente',condition:'USADO',category:{name:'Calculadoras'},images:[],expiresIn:60};

test('product lookup uses own history for the owner, public gallery for an eligible receiver and aborts on close',async()=>{
 const owner=productFixture(agreement(),true);owner.render();assert.equal(owner.reads[0].source,'own');owner.reads[0].resolve(product);await setImmediate();assert.equal(owner.render().product.description,'Producto vigente');owner.h.unmount();
 const receiver=productFixture(agreement({role:'RECEPTOR'}));receiver.render();assert.equal(receiver.reads[0].source,'public');receiver.h.unmount();assert.equal(receiver.reads[0].signal.aborted,true);
 receiver.reads[0].resolve(product);await setImmediate();
});

test('product reader also accepts a pending request without transaction fields and aborts its gallery read on close',()=>{
 const q=productFixture({id:'request-only',role:'RECEPTOR',publication:{id:'requested-product',status:'DISPONIBLE',isWithdrawn:false}});
 q.render();assert.equal(q.reads.length,1);assert.equal(q.reads[0].source,'public');assert.equal(q.reads[0].id,'requested-product');q.h.unmount();assert.equal(q.reads[0].signal.aborted,true);
});

test('product lookup never explores another campus or withdrawn/hidden resources for the receiver',()=>{
 for(const [detail,historical]of [[agreement({role:'RECEPTOR'}),true],[agreement({role:'RECEPTOR',publication:{id:'pub',isWithdrawn:true,status:'RESERVADO'}}),false],[agreement({role:'RECEPTOR',publication:{id:'pub',isWithdrawn:false,status:'OCULTO'}}),false]]){
  const q=productFixture(detail,historical);q.render();const state=q.render();assert.equal(q.reads.length,0);assert.equal(state.unavailable,true);assert.equal(state.product,null);q.h.unmount();
 }
});

test('product read failures retain the agreement, allow retry and reject stale data after unmount',async()=>{
 const q=productFixture();q.render();q.reads[0].reject(new Error('offline'));await setImmediate();let state=q.render();assert.equal(state.error,copy.productError);assert.equal(state.product,null);
 state.reload();q.render();assert.equal(q.reads.length,2);q.reads[1].resolve(product);await setImmediate();state=q.render();assert.equal(state.error,null);assert.equal(state.product.id,'pub');q.h.unmount();
});

test('real product modal shows images, current description and original transaction price',()=>{
 const markup=renderCatalog('physical',{mode:'transaction',agreementPanel:'accepted',width:360}).markup;
 for(const text of ['Recurso de la transacción','Fotografía 1 de 2','Fotografía 2 de 2','Calculadoras','Incluye tapa protectora','términos originales'])assert.ok(markup.includes(text),text);
 assert.match(markup,/12\.000/);assert.doesNotMatch(markup,/Confirmar que se realizó|Dónde estás/);
 for(const[variant,self,other]of [['available','Vendedor','Comprador'],['participants-buyer','Comprador','Vendedor'],['participants-donation','Donante','Receptor'],['participants-same-name','Vendedor','Comprador']]){
  const overview=renderCatalog('physical',{mode:'transaction',variant,width:360}).markup.replace(/<!--.*?-->/g,'');
  assert.ok(overview.includes(`${self} (tú)`));assert.ok(!overview.includes(`${other} (tú)`));assert.equal(overview.match(/\(tú\)/g)?.length,1);
  assert.ok(overview.indexOf('Monto acordado:')>overview.indexOf(other));
  const product=renderCatalog('physical',{mode:'transaction',variant,agreementPanel:'accepted',width:360}).markup.replace(/<!--.*?-->/g,'');
  assert.ok(product.includes(`${self} (tú)`));assert.ok(!product.includes(`${other} (tú)`));
 }
 for(const[variant,expected]of [['product-loading',/Cargando información del recurso/],['product-error',/Reintentar información/],['product-unavailable',/no están disponibles/],['no-photos',/Sin fotografías disponibles/]]){
  assert.match(renderCatalog('physical',{mode:'transaction',agreementPanel:'accepted',variant}).markup,expected);
 }
 for(const variant of ['waiting','completed','historical','cancelled']){
  const confirm=renderCatalog('physical',{mode:'transaction',agreementPanel:'confirm',variant}).markup;
  assert.match(confirm,/Confirmaciones ·/);assert.doesNotMatch(confirm,/Dónde estás/);
  if(variant!=='waiting')assert.doesNotMatch(confirm,/Confirmar que se realizó/);
 }
});

test('product gallery selects another image and handles a broken image without losing the selector',()=>{
 const h=runtime(),{AgreementProductGallery}=load('components/AgreementProductUI.tsx',{
  react:h.react,'react/jsx-runtime':jsx,'react-native':{...native,Image:'Image',ScrollView:'Scroll'},'react-native-svg':{default:'Svg',Path:'Path'},'./AgreementStepModal':{AgreementStepModal:'StepModal'},'@/components/Skeleton':{Skeleton:'Skeleton',SkeletonBlock:'Block'},'lucide-react-native':{ImageIcon:'Placeholder',X:'X'},
  'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},'./CatalogUI':{CATALOG_COLORS:{},ui:{}},'./ResourceDetailUI':{detailUI:{}},'../utils/agreementPresentation':presentation,
 });
 const images=[{id:'one',url:'one',principal:true},{id:'two',url:'two'}],render=()=>elements(h.render(()=>AgreementProductGallery({title:'Calculadora',images})));
 let nodes=render();assert.equal(nodes.find(row=>row.type==='Image').props.source.uri,'one');nodes.filter(row=>row.type==='Button')[1].props.onPress();
 nodes=render();assert.equal(nodes.find(row=>row.type==='Image').props.source.uri,'two');assert.equal(nodes.filter(row=>row.type==='Button')[1].props.accessibilityState.selected,true);
 nodes.find(row=>row.type==='Image').props.onError();nodes=render();assert.ok(nodes.some(row=>row.type==='Placeholder'));assert.equal(nodes.filter(row=>row.type==='Button').length,2);
 nodes.filter(row=>row.type==='Button')[0].props.onPress();assert.equal(render().find(row=>row.type==='Image').props.source.uri,'one');h.unmount();
});

test('coordination modal owns pull refresh and 7s polling, pauses for location selection and keeps the main scroll disabled',()=>{
 const q=physicalDetailFixture();let refreshes=0,cancelled=0;q.state.refreshMessages=()=>refreshes++;q.state.cancelMessageRefresh=()=>cancelled++;
 let nodes=q.render();assert.equal(q.polling.at(-1)[1],false);nodes.find(row=>row.type==='Stepper').props.onSelect('coordinate');nodes=q.render();
 let modal=nodes.find(row=>row.type==='StepModal');assert.ok(modal);assert.equal(modal.props.fillHeight,true);assert.equal(modal.props.refresh.onRefresh,q.state.refreshMessages);assert.equal(modal.props.refresh.enabled,true);assert.equal(refreshes,1);
 assert.ok(elements(modal).some(row=>row.type==='Coordination'));assert.ok(!elements(nodes.find(row=>row.type==='Scroll')).some(row=>row.type==='Coordination'));assert.equal(nodes.find(row=>row.type==='Scroll').props.refreshEnabled,false);
 assert.equal(q.polling.at(-1)[0],q.state.pollMessages);assert.equal(q.polling.at(-1)[1],true);assert.equal(q.polling.at(-1)[2],7000);
 nodes.find(row=>row.type==='Coordination').props.onSelectingChange(true);nodes=q.render();assert.equal(q.polling.at(-1)[1],false);assert.equal(nodes.find(row=>row.type==='StepModal').props.refresh.enabled,false);
 nodes.find(row=>row.type==='Coordination').props.onSelectingChange(false);q.state.messagesRefreshing=true;nodes=q.render();assert.equal(q.polling.at(-1)[1],false);assert.equal(nodes.find(row=>row.type==='StepModal').props.refresh.refreshing,true);
 q.state.messagesRefreshing=false;q.state.busy=true;nodes=q.render();assert.equal(nodes.find(row=>row.type==='StepModal').props.closeDisabled,true);q.state.busy=false;
 nodes=q.render();nodes.find(row=>row.type==='StepModal').props.onClose();nodes=q.render();assert.ok(!nodes.some(row=>row.type==='StepModal'));assert.ok(cancelled>0);assert.equal(q.polling.at(-1)[1],false);q.h.unmount();
});

test('confirmation stays in its modal during reload and submits once without a second decision',()=>{
 const q=physicalDetailFixture();let nodes=q.render();nodes.find(row=>row.type==='Stepper').props.onSelect('confirm');nodes=q.render();
 let modal=nodes.find(row=>row.type==='StepModal');assert.equal(modal.props.refresh.onRefresh,q.state.refreshDetail);assert.equal(modal.props.refresh.refreshing,false);assert.ok(elements(modal).some(row=>row.type==='People'));
 nodes.find(row=>row.type==='Footer').props.onConfirm();nodes=q.render();assert.deepEqual(q.calls,['confirm']);assert.equal(nodes.find(row=>row.type==='StepModal').props.overlay,undefined);assert.equal(nodes.find(row=>row.type==='StepModal').props.preferredHeight,680);
 const detail=q.state.detail;q.state.detail=null;q.state.loading=true;nodes=q.render();assert.ok(nodes.some(row=>row.type==='StepModal'));assert.equal(nodes.find(row=>row.type==='Footer').props.disabled,true);
 q.state.loading=false;q.state.error='No se pudo consultar';nodes=q.render();assert.equal(nodes.find(row=>row.type==='Footer').props.disabled,true);
 q.state.detail=detail;q.state.error=null;nodes=q.render();nodes.find(row=>row.type==='StepModal').props.onClose();assert.ok(!q.render().some(row=>row.type==='StepModal'));
 nodes=q.render();nodes.find(row=>row.type==='Stepper').props.onSelect('confirm');q.render();nodes=q.render({publicationId:'other',transactionId:'other-trade'});assert.ok(!nodes.some(row=>row.type==='StepModal'));assert.ok(!nodes.some(row=>row.type==='Summary'));q.h.unmount();
});

test('confirmation, rating and receipt keep one modal size and change scroll only between phases',()=>{
 const q=physicalDetailFixture({panelsOnly:true,initialPanel:'confirm'});let nodes=q.render();const modal=()=>nodes.find(row=>row.type==='StepModal');assert.equal(modal().props.contentKey,'confirm');assert.equal(modal().props.preferredHeight,680);
 q.state.busy=true;q.state.operation='confirm';nodes=q.render();assert.equal(modal().props.contentKey,'confirm');assert.equal(nodes.find(row=>row.type==='Footer').props.busy,true);
 q.state.busy=false;q.state.loading=true;nodes=q.render();assert.equal(nodes.find(row=>row.type==='Footer').props.busy,true);assert.ok(!nodes.some(row=>row.type==='PanelSkeleton'));
 q.state.loading=false;q.state.operation=null;q.state.detail=agreement({status:'COMPLETADA',role:'RECEPTOR',canConfirm:false,canCancel:false,canRate:true,rating:null});nodes=q.render();assert.equal(modal().props.title,'Valorar transacción');assert.equal(modal().props.contentKey,'rating');assert.ok(!nodes.some(row=>row.type==='People'));
 q.state.busy=true;q.state.operation='rating';nodes=q.render();assert.equal(modal().props.contentKey,'rating');assert.equal(modal().props.preferredHeight,680);assert.ok(!nodes.some(row=>row.type==='PanelSkeleton'));
 q.state.busy=false;q.state.operation=null;q.state.detail={...q.state.detail,canRate:false,rating:{score:5}};nodes=q.render();assert.equal(modal().props.contentKey,'saved');assert.equal(modal().props.preferredHeight,680);assert.match(JSON.stringify(nodes),/Gracias por valorar/);assert.ok(!nodes.some(row=>row.type==='People'));q.h.unmount();
});

test('confirmation places the payment notice after its action, omits resource title and owns guarded pull refresh',()=>{
 const q=physicalDetailFixture({panelsOnly:true,initialPanel:'confirm'});let nodes=q.render(),modal=nodes.find(row=>row.type==='StepModal');
 assert.equal(modal.props.refresh.onRefresh,q.state.refreshDetail);assert.equal(modal.props.refresh.enabled,true);assert.equal(modal.props.refresh.label,copy.confirmationsRefresh);assert.ok(!nodes.some(row=>row.type==='Text'&&row.props.children==='Calculadora'));assert.doesNotMatch(JSON.stringify(nodes),/Actualizando estado de la transacción/);
 const people=nodes.find(row=>row.type==='People'),children=elements(people);assert.ok(children.findIndex(row=>row.type==='Notice')>children.findIndex(row=>row.type==='Footer'));
 q.state.detailRefreshing=true;q.state.loading=true;nodes=q.render();assert.equal(nodes.find(row=>row.type==='StepModal').props.refresh.refreshing,true);assert.equal(nodes.find(row=>row.type==='StepModal').props.refresh.enabled,false);
 q.state.loading=false;q.state.detailRefreshing=false;q.state.ratingConfirmation=true;assert.equal(q.render().find(row=>row.type==='StepModal').props.refresh.enabled,false);q.state.ratingConfirmation=false;
 q.state.selectAction('confirm');assert.equal(q.render().find(row=>row.type==='StepModal').props.refresh.enabled,false);q.h.unmount();
 const markup=renderCatalog('physical',{mode:'personal',inlinePanel:'confirm'}).markup;assert.ok(markup.indexOf('CampusLink registra el acuerdo')>markup.indexOf('Confirmar que se realizó'));
 for(const entry of ['accepted','coordinate','confirm','menu'])assert.doesNotMatch(renderCatalog('physical',{mode:'personal',inlinePanel:entry,transactionState:'loading'}).markup,/Actualizando estado de la transacción/);
});

test('shared modal uses the project RefreshScrollView with safe offset and blocks closing while writing',()=>{
 const {AgreementStepModal}=load('components/AgreementStepModal.tsx',{'react/jsx-runtime':jsx,'react-native':{...native,Modal:'Modal',ScrollView:'Scroll',KeyboardAvoidingView:'Keyboard',Platform:{OS:'ios'}},'lucide-react-native':{X:'X'},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:59,bottom:34})},'@/components/RefreshScrollView':{RefreshScrollView:'Refresh'},'./CatalogUI':{CATALOG_COLORS:{},ui:{}}});
 let closed=0;const refresh={onRefresh:noop,refreshing:true,enabled:false,label:'los mensajes'};
 let tree=AgreementStepModal({title:'Coordinar',closeLabel:'Cerrar coordinar',onClose:()=>closed++,refresh,fillHeight:true,children:'Contenido'}),nodes=elements(tree),scroll=nodes.find(row=>row.type==='Refresh');
 assert.equal(scroll.props.onRefresh,refresh.onRefresh);assert.equal(scroll.props.refreshing,true);assert.equal(scroll.props.refreshEnabled,false);assert.equal(scroll.props.refreshIndicatorOffset,8);tree.props.onRequestClose();assert.equal(closed,1);
 tree=AgreementStepModal({title:'Confirmar',closeLabel:'Cerrar confirmar',onClose:()=>closed++,closeDisabled:true,keyboardAvoiding:true,children:'Confirmaciones'});tree.props.onRequestClose();assert.equal(closed,1);assert.ok(elements(tree).some(row=>row.type==='Scroll'));assert.ok(!elements(tree).some(row=>row.type==='Refresh'));assert.equal(elements(tree).find(row=>row.type==='Keyboard').props.enabled,true);assert.equal(elements(tree).find(row=>row.type==='Keyboard').props.behavior,'padding');
});

test('coordination header includes the resource and removes duplicated title and refresh instructions from its body',()=>{
 const q=physicalDetailFixture();let nodes=q.render();nodes.find(row=>row.type==='Stepper').props.onSelect('coordinate');nodes=q.render();const modal=nodes.find(row=>row.type==='StepModal');
 assert.equal(modal.props.title,'Coordinación para la entrega de Calculadora');assert.ok(!elements(modal).some(row=>row.type==='Text'&&row.props.children==='Calculadora'));
 assert.doesNotMatch(JSON.stringify(elements(modal)),/Desliza hacia abajo para ver los mensajes/);assert.equal(modal.props.refresh.onRefresh,q.state.refreshMessages);assert.equal(q.polling.at(-1)[2],7000);q.h.unmount();
});

test('coordination dropdowns appear progressively and POI is optional with a floor-only option',()=>{
 const h=runtime(),changes=[],selected=[],building={id:'a',name:'Edificio A',floors:[{id:'one',name:'Piso 1',pois:[{id:'library',name:'Biblioteca'}]},{id:'two',name:'Piso 2',pois:[]}]};
 const state={detail:null,building:undefined,options:{buildings:[building]},buildingId:'',floorId:'',poiKey:'',messages:null,optionsLoading:false,messagesLoading:false,messagesRefreshing:false,busy:false,loading:false,preview:null,
  setBuilding:value=>{changes.push(['building',value]);state.buildingId=value;state.building=building;state.floorId='';state.poiKey='';},setFloor:value=>{changes.push(['floor',value]);state.floorId=value;state.poiKey='';},setPoi:value=>{changes.push(['poi',value]);state.poiKey=value;},send:noop};
 const {PhysicalgoodsCoordination}=load('physicalgoods/components/PhysicalgoodsCoordination.tsx',{react:h.react,'react/jsx-runtime':jsx,'react-native':native,'lucide-react-native':{ChevronDown:'Down'},'../../components/CatalogUI':{CATALOG_COLORS:{},FilterOptions:'Options',FilterSheet:'Sheet',ui:{}},'../../components/ResourceDetailUI':{detailUI:{}},'../../components/RequestsUI':{RequestButton:'Action',RequestsPager:'Pager'},'../../components/TransactionUI':{TransactionFeedback:'Feedback',transactionDate:value=>value},'../../utils/agreementPresentation':presentation});
 const render=()=>elements(h.render(()=>PhysicalgoodsCoordination({state,onSelectingChange:value=>selected.push(value)}))),buttons=nodes=>nodes.filter(row=>row.type==='Button');
 let nodes=render();assert.equal(buttons(nodes).length,1);assert.equal(buttons(nodes)[0].props.accessibilityLabel,'Seleccionar edificio');buttons(nodes)[0].props.onPress();nodes=render();nodes.find(row=>row.type==='Options').props.onChange('a');
 nodes=render();assert.equal(buttons(nodes).length,2);buttons(nodes)[1].props.onPress();nodes=render();nodes.find(row=>row.type==='Options').props.onChange('one');
 nodes=render();assert.equal(buttons(nodes).length,3);buttons(nodes)[2].props.onPress();nodes=render();assert.deepEqual(Array.from(nodes.find(row=>row.type==='Options').props.options,row=>row.id),['','library']);nodes.find(row=>row.type==='Options').props.onChange('library');
 nodes=render();assert.equal(state.poiKey,'library');buttons(nodes)[2].props.onPress();nodes=render();nodes.find(row=>row.type==='Options').props.onChange('');assert.equal(state.poiKey,'');
 nodes=render();buttons(nodes)[1].props.onPress();nodes=render();nodes.find(row=>row.type==='Options').props.onChange('two');nodes=render();assert.equal(buttons(nodes).length,2);assert.equal(state.poiKey,'');assert.ok(selected.includes(true));assert.equal(selected.at(-1),false);assert.deepEqual(changes[2],['poi','library']);h.unmount();
});

test('real coordination modal renders all hierarchy states without the removed instructions',()=>{
 for(const[variant,hasFloor,hasPoi]of [['coord-building',false,false],['coord-floor',true,false],['coord-poi',true,true],['coord-poi-selected',true,true],['coord-no-poi',true,false]]){
  const markup=renderCatalog('physical',{mode:'transaction',agreementPanel:'coordinate',variant,width:360}).markup;
  assert.match(markup,/Coordinación para la entrega de Calculadora científica/);assert.doesNotMatch(markup,/Desliza hacia abajo para ver los mensajes más recientes/);
  assert.equal(markup.includes('Seleccionar piso'),hasFloor,variant);assert.equal(markup.includes('Seleccionar punto de interés'),hasPoi,variant);
  if(variant==='coord-poi-selected')assert.match(markup,/Estoy en Edificio Central, en Piso 1, en Biblioteca\./);
 }
});
