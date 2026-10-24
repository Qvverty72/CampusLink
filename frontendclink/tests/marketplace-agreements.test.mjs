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
const uiDeps=h=>({react:h.react,'react/jsx-runtime':jsx,'react-native':native,'lucide-react-native':{ArrowLeft:'Icon',Check:'Check',ChevronDown:'Down',ChevronRight:'Right',MoreHorizontal:'More'},'./CatalogUI':{CATALOG_COLORS:{},FilterSheet:'Sheet',ui:{}},'./ResourceDetailUI':{detailUI:{},DetailActionBar:'Footer'},'./TransactionUI':{transactionDate:value=>value},'../utils/agreementPresentation':presentation});

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

test('agreement card has one tap target; summary is collapsed and original terms expand without changing state',()=>{
 const h=runtime(),ui=load('components/AgreementUI.tsx',uiDeps(h)),calls=[];
 const nodes=elements(ui.AgreementCard({title:'Libro',roleLabel:'Vendes a Diego',campus:'Campus',price:'$1.000',state:'COORDINANDO',label:copy.coordinating,next:copy.coordinate,requiresAction:true,dateLabel:'Hoy',onPress:()=>calls.push('trade')}));
 assert.equal(nodes.filter(node=>node.type==='Button').length,1);nodes[0].props.onPress();assert.deepEqual(calls,['trade']);
 const props={...agreement(),view:presentation.agreementPresentation(agreement()),campus:'Campus',resourceStatus:'RESERVADO'};
 let tree=elements(h.render(()=>ui.AgreementSummary(props)));assert.doesNotMatch(JSON.stringify(tree),/2026-10-20/);
 tree.find(node=>node.type==='Button').props.onPress();tree=elements(h.render(()=>ui.AgreementSummary(props)));assert.match(JSON.stringify(tree),/2026-10-20/);h.unmount();
});

test('CTA preserves confirmation before sending location and disables waiting/terminal/history without new rules',()=>{
 const h=runtime(),{AgreementActionBar,AgreementStepper}=load('components/AgreementUI.tsx',uiDeps(h));
 const props={view:presentation.agreementPresentation(agreement()),canConfirm:true,readOnly:false,busy:false,disabled:false,onConfirm:noop};
 assert.equal(AgreementActionBar(props).props.disabled,false);
 assert.equal(AgreementActionBar({...props,view:presentation.agreementPresentation(agreement({confirmations:[confirmed('owner','PROPIETARIO')]}))}).props.disabled,true);
 assert.equal(AgreementStepper({state:'CANCELADO'}),null);assert.equal(AgreementActionBar({...props,readOnly:true}),null);assert.equal(AgreementActionBar({...props,view:presentation.agreementPresentation(agreement({status:'COMPLETADA'}))}),null);
});

function metadataFixture(){
 const h=runtime(),reads=[];let rows=Array.from({length:5},(_,i)=>({...agreement(),id:String(i)})),enabled=true,live=0,peak=0;
 const {usePhysicalgoodsAgreementPage}=load('physicalgoods/hooks/usePhysicalgoodsAgreementPage.ts',{react:h.react,'@/features/auth/hooks/useAuth':{useAuth:()=>({identity:{userId:'owner',campusId:'campus'},refreshIdentity:noop})},'@/lib/api/authenticated-request':{AuthApiError},'../api/physicalgoodsApi':{loadPhysicalgoodsTransaction:(target,signal)=>{const job=deferred();reads.push({...job,target,signal});live++;peak=Math.max(peak,live);return job.promise.finally(()=>live--);}}});
 return{h,reads,get peak(){return peak;},disable:()=>enabled=false,render:()=>h.render(()=>usePhysicalgoodsAgreementPage(rows,enabled))};
}

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
 const history={page:{data,meta:{hasMore:true}},number:2,loading:false,error:null,reload:noop,setNumber:noop};const meta={details:Object.fromEntries(data.map(row=>[row.id,row])),failed:[],loading:false,reload:noop};
 const {PhysicalgoodsAgreements}=load('physicalgoods/components/PhysicalgoodsAgreements.tsx',{react:h.react,'react/jsx-runtime':jsx,'react-native':native,'@/components/RefreshScrollView':{useScrollRefresh:(...args)=>registered.push(args)},'../hooks/usePhysicalgoodsHistory':{usePhysicalgoodsHistory:()=>history},'../hooks/usePhysicalgoodsAgreementPage':{usePhysicalgoodsAgreementPage:()=>meta},'../../components/AgreementUI':{AgreementCard:'Card'},'../../components/RequestsUI':{RequestsPager:'Pager',RequestButton:'Action'},'../../components/PersonalUI':{PersonalEmpty:'Empty',PersonalSkeleton:'Skeleton'},'../../components/CatalogUI':{CATALOG_COLORS:{},ui:{}},'../../components/ResourceDetailUI':{detailUI:{}},'../../utils/agreementPresentation':presentation});
 return{h,history,meta,registered,opened,render:(refreshEnabled=true)=>elements(h.render(()=>PhysicalgoodsAgreements({active:true,refreshVersion:0,refreshEnabled,onExplore:noop,onAgreement:(...args)=>opened.push(args)})))};
}

test('list groups actions before waiting, counts only its page, sorts closed dates and routes the exact card',()=>{
 const q=listFixture();let nodes=q.render();assert.deepEqual(nodes.filter(row=>row.type==='Card').map(row=>row.props.state),['COORDINANDO','ESPERANDO_TU_CONFIRMACION','ESPERANDO_OTRO']);
 assert.match(JSON.stringify(nodes),/Acuerdos de esta página/);nodes.find(row=>row.type==='Card').props.onPress();assert.deepEqual(q.opened,[['pub','trade']]);
 assert.equal(q.registered.at(-1)[0],q.history.reload);assert.equal(q.registered.at(-1)[2],true);q.render(false);assert.equal(q.registered.at(-1)[2],false);
 nodes.find(row=>row.type==='Button'&&row.props.accessibilityRole==='tab'&&row.key==='finished').props.onPress();nodes=q.render();assert.deepEqual(nodes.filter(row=>row.type==='Card').map(row=>row.props.state),['FINALIZADO','CANCELADO']);
 assert.ok(nodes.filter(row=>row.type==='Card').every(row=>!row.props.next));assert.equal(nodes.find(row=>row.type==='Pager').props.page,2);q.h.unmount();
});

test('partial metadata errors never invent a counterpart or confirmation state',()=>{
 const q=listFixture();delete q.meta.details.trade;q.meta.failed.push('trade');const nodes=q.render();const card=nodes.find(row=>row.type==='Card'&&row.props.label===copy.unknown);
 assert.ok(card);assert.equal(card.props.state,undefined);assert.equal(card.props.requiresAction,false);assert.equal(card.props.roleLabel,copy.seller);assert.match(JSON.stringify(nodes),/No pudimos consultar/);q.h.unmount();
});

function physicalDetailFixture(){
 const h=runtime(),calls=[],polling=[],state={detail:agreement(),loading:false,busy:false,messagesLoading:false,optionsLoading:false,historical:false,error:null,action:null,
  messagesRefreshing:false,refreshMessages:noop,cancelMessageRefresh:noop,cancelMessagePolling:noop,pollMessages:noop,reload:noop,poll:noop,selectAction:value=>state.action=value,cancelAction:()=>state.action=null,confirm:()=>calls.push('confirm'),cancel:()=>calls.push('cancel')};
 const origin={request:null,loading:false,error:null,open:received=>calls.push(['origin',received]),close:noop};
 const {PhysicalgoodsTransaction}=load('physicalgoods/components/PhysicalgoodsTransaction.tsx',{react:h.react,'react/jsx-runtime':jsx,'react-native':{...native,Modal:'Modal'},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:20,bottom:20})},'@/components/RefreshScrollView':{RefreshScrollView:'Scroll'},'../../hooks/useAgreementPolling':{useAgreementPolling:(...args)=>polling.push(args),COORDINATION_MESSAGES_POLL_INTERVAL:7000},'../../components/AgreementStepModal':{AgreementStepModal:'StepModal'},'../../components/OwnerRating':{},'../../components/MarketplaceReportForm':{MarketplaceReportForm:'Report'},'../hooks/usePhysicalgoodsTransaction':{usePhysicalgoodsTransaction:()=>state},'../hooks/usePhysicalgoodsAgreementRequest':{usePhysicalgoodsAgreementRequest:()=>origin},'../../components/ResourceDetailUI':{AgreementNotice:'Notice',detailUI:{}},'../../components/AgreementUI':{AgreementHeader:'Header',AgreementSummary:'Summary',AgreementMenu:'Menu',AgreementStepper:'Stepper',AgreementActionBar:'Footer'},'../../utils/agreementPresentation':presentation,'../../components/TransactionUI':{TransactionConfirmations:'People',TransactionDecisionDialog:'Dialog',TransactionFeedback:'Feedback',transactionUI:{}},'./PhysicalgoodsCoordination':{PhysicalgoodsCoordination:'Coordination',PhysicalgoodsCoordinationMessages:'Messages'},'./PhysicalgoodsHistory':{PhysicalgoodsHistoryDetail:'History'},'./PhysicalgoodsAgreementProduct':{PhysicalgoodsAgreementProduct:'ProductModal'}});
 const render=(target={publicationId:'pub',transactionId:'trade'})=>elements(h.render(()=>PhysicalgoodsTransaction({target,onClose:noop,onChanged:noop,onOpen:id=>calls.push(id)})));
 return{h,calls,polling,state,origin,render};
}

test('physical detail menu keeps cancellation and reporting behind explicit decisions and exact callbacks',()=>{
 const {h,calls,state,render}=physicalDetailFixture();
 let nodes=render();const menu=nodes.find(row=>row.type==='Menu');assert.deepEqual(Array.from(menu.props.actions,row=>row.label),[copy.request,copy.resource,copy.report,copy.cancel]);
 menu.props.actions[0].onPress();menu.props.actions[1].onPress();assert.deepEqual(calls,[['origin',true],'pub']);
 menu.props.actions[3].onPress();assert.ok(!calls.includes('cancel'));nodes=render();nodes.find(row=>row.type==='Dialog').props.onCancel();assert.ok(!calls.includes('cancel'));
 state.selectAction('confirm');nodes=render();nodes.find(row=>row.type==='Dialog').props.onConfirm();assert.ok(calls.includes('confirm'));
 state.action=null;state.historical=true;nodes=render();assert.equal(nodes.find(row=>row.type==='Menu').props.actions.length,2);assert.equal(nodes.find(row=>row.type==='Menu').props.actions[1].disabled,true);h.unmount();
});

for(const variant of ['available','needs-confirmation','waiting','completed','cancelled'])test(`real agreement detail ${variant} keeps the payment notice before coordination and no manual messages refresh`,()=>{
 const markup=renderCatalog('physical',{mode:'transaction',variant,width:390}).markup;
 assert.match(markup,/CampusLink registra el acuerdo/);assert.doesNotMatch(markup,/Actualizar mensajes/);assert.match(markup,/Vendes a Diego Pérez/);
 if(variant==='available'){
  assert.doesNotMatch(markup,/Dónde estás|Confirmaciones ·|Confirmar que se realizó/);
  const coordination=renderCatalog('physical',{mode:'transaction',agreementPanel:'coordinate',width:390}).markup;
  assert.ok(coordination.indexOf('CampusLink registra el acuerdo')<coordination.indexOf('Dónde estás'));
 }
 if(variant==='needs-confirmation')assert.match(markup,/Falta tu confirmación/);
 if(variant==='waiting')assert.match(markup,/Esperando a Diego Pérez/);
 if(variant==='completed')assert.match(markup,/Finalizado/);
 if(variant==='cancelled')assert.match(markup,/Cancelado/);
});

test('real list separates active and terminal groups and preserves no duplicate links',()=>{
 const markup=renderCatalog('physical',{mode:'transactions'}).markup;assert.match(markup,/Requiere tu acción|REQUIERE TU ACCIÓN/);assert.match(markup,/Esperando a Diego Pérez/);
 assert.doesNotMatch(markup,/Ver solicitud|Ver recurso/);assert.match(markup,/Activos/);
 const finished=renderCatalog('physical',{mode:'transactions',variant:'finished'}).markup;assert.match(finished,/Finalizado/);assert.match(finished,/Cancelado/);assert.doesNotMatch(finished,/Coordinando entrega/);
});

test('historical active agreements remain readable without promising unavailable actions',()=>{
 const q=listFixture();q.meta.details.trade={...q.meta.details.trade,canConfirm:false,canCancel:false};const nodes=q.render();const card=nodes.find(row=>row.type==='Card'&&row.props.title==='Calculadora'&&row.props.next===copy.readOnly);
 assert.ok(card);assert.equal(card.props.requiresAction,false);card.props.onPress();assert.deepEqual(q.opened,[['pub','trade']]);q.h.unmount();
});

test('step buttons reveal only their panel, product modal closes cleanly, and confirm still needs a decision',()=>{
 const q=physicalDetailFixture();let nodes=q.render();
 assert.ok(!nodes.some(row=>['Coordination','People','Footer','ProductModal'].includes(row.type)));
 nodes.find(row=>row.type==='Stepper').props.onSelect('coordinate');nodes=q.render();
 assert.ok(nodes.some(row=>row.type==='Coordination'));assert.ok(!nodes.some(row=>row.type==='People'));
 nodes.find(row=>row.type==='Stepper').props.onSelect('confirm');nodes=q.render();
 const people=nodes.find(row=>row.type==='People'),footer=nodes.find(row=>row.type==='Footer');
 assert.ok(elements(people).includes(footer));assert.equal(footer.props.inline,true);assert.ok(!nodes.some(row=>row.type==='Coordination'));
 assert.deepEqual(q.calls,[]);footer.props.onConfirm();assert.equal(q.state.action,'confirm');assert.deepEqual(q.calls,[]);
 q.render().find(row=>row.type==='Dialog').props.onCancel();
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
 for(const text of ['Recurso del acuerdo','Fotografía 1 de 2','Fotografía 2 de 2','Calculadoras','Incluye tapa protectora','términos originales'])assert.ok(markup.includes(text),text);
 assert.match(markup,/12\.000/);assert.doesNotMatch(markup,/Confirmar que se realizó|Dónde estás/);
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
  react:h.react,'react/jsx-runtime':jsx,'react-native':{...native,Image:'Image',ScrollView:'Scroll'},'./AgreementStepModal':{AgreementStepModal:'StepModal'},'lucide-react-native':{ImageIcon:'Placeholder',X:'X'},
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

test('confirmation stays in its modal during reload and embeds the final decision without a sibling native modal',()=>{
 const q=physicalDetailFixture();let nodes=q.render();nodes.find(row=>row.type==='Stepper').props.onSelect('confirm');nodes=q.render();
 let modal=nodes.find(row=>row.type==='StepModal');assert.equal(modal.props.refresh,undefined);assert.ok(elements(modal).some(row=>row.type==='People'));
 nodes.find(row=>row.type==='Footer').props.onConfirm();nodes=q.render();let decision=nodes.find(row=>row.type==='Dialog');assert.equal(decision.props.embedded,true);assert.equal(nodes.filter(row=>row.type==='Dialog').length,1);assert.deepEqual(q.calls,[]);
 nodes.find(row=>row.type==='StepModal').props.onClose();nodes=q.render();assert.equal(q.state.action,null);assert.ok(nodes.some(row=>row.type==='StepModal'));
 const detail=q.state.detail;q.state.detail=null;q.state.loading=true;nodes=q.render();assert.ok(nodes.some(row=>row.type==='StepModal'));assert.equal(nodes.find(row=>row.type==='Footer').props.disabled,true);
 q.state.loading=false;q.state.error='No se pudo consultar';nodes=q.render();assert.equal(nodes.find(row=>row.type==='Footer').props.disabled,true);
 q.state.detail=detail;q.state.error=null;nodes=q.render();nodes.find(row=>row.type==='StepModal').props.onClose();assert.ok(!q.render().some(row=>row.type==='StepModal'));
 nodes=q.render();nodes.find(row=>row.type==='Stepper').props.onSelect('confirm');q.render();nodes=q.render({publicationId:'other',transactionId:'other-trade'});assert.ok(!nodes.some(row=>row.type==='StepModal'));assert.ok(!nodes.some(row=>row.type==='Summary'));q.h.unmount();
});

test('shared modal uses the project RefreshScrollView with safe offset and blocks closing while writing',()=>{
 const {AgreementStepModal}=load('components/AgreementStepModal.tsx',{'react/jsx-runtime':jsx,'react-native':{...native,Modal:'Modal',ScrollView:'Scroll'},'lucide-react-native':{X:'X'},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:59,bottom:34})},'@/components/RefreshScrollView':{RefreshScrollView:'Refresh'},'./CatalogUI':{CATALOG_COLORS:{},ui:{}}});
 let closed=0;const refresh={onRefresh:noop,refreshing:true,enabled:false,label:'los mensajes'};
 let tree=AgreementStepModal({title:'Coordinar',closeLabel:'Cerrar coordinar',onClose:()=>closed++,refresh,fillHeight:true,children:'Contenido'}),nodes=elements(tree),scroll=nodes.find(row=>row.type==='Refresh');
 assert.equal(scroll.props.onRefresh,refresh.onRefresh);assert.equal(scroll.props.refreshing,true);assert.equal(scroll.props.refreshEnabled,false);assert.equal(scroll.props.refreshIndicatorOffset,8);tree.props.onRequestClose();assert.equal(closed,1);
 tree=AgreementStepModal({title:'Confirmar',closeLabel:'Cerrar confirmar',onClose:()=>closed++,closeDisabled:true,children:'Confirmaciones'});tree.props.onRequestClose();assert.equal(closed,1);assert.ok(elements(tree).some(row=>row.type==='Scroll'));assert.ok(!elements(tree).some(row=>row.type==='Refresh'));
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
