import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {setImmediate} from 'node:timers/promises';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import {renderCatalog} from './helpers/marketplace-render.mjs';
const noop=()=>{},elements=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(6).flatMap(elements)];
class AuthApiError extends Error{constructor(status){super();this.status=status;}}
function runtime(){const slots=[];let index=0,effects=[];const react={
 useState(initial){const i=index++;slots[i]??={value:typeof initial==='function'?initial():initial};return[slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next;}];},
 useRef(initial){const i=index++;return slots[i]??={current:initial};},
 useCallback(fn,deps){const i=index++;if(!slots[i]||deps.some((v,j)=>!Object.is(v,slots[i].deps[j])))slots[i]={deps,value:fn};return slots[i].value;},
 useEffect(fn,deps){const i=index++;if(!slots[i]||deps.some((v,j)=>!Object.is(v,slots[i].deps[j])))effects.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:fn()};});},
 };return{react,render(fn){index=0;effects=[];const result=fn();effects.forEach(fn=>fn());return result;},unmount(){slots.forEach(slot=>slot?.cleanup?.());}};}
function load(file,deps,extra=''){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(new URL('../src/features/marketplace/'+file,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code+extra,{module,exports:module.exports,AbortController,require:name=>{assert.ok(Object.hasOwn(deps,name),name);return deps[name];}});return module.exports;}
function pending(queue,args){return new Promise((resolve,reject)=>queue.push({args,resolve,reject}));}
const trade={id:'trade',publicationId:'publication',ownerId:'owner',receiverId:'receiver',status:'RESERVADA',canConfirm:true,canCancel:true,canRate:false,confirmations:[],rating:null};
const {agreementCopy}=load('utils/agreementPresentation.ts',{});
const {digitalTransactionPresentation}=load('elibrary/utils/digitalTransactionPresentation.ts',{'../../utils/agreementPresentation':{agreementCopy}});

test('digital transaction presentation distinguishes own action, waiting and terminal states using the correct ID and role',()=>{
 assert.equal(digitalTransactionPresentation(trade,'receiver').group,'action');
 const mine={...trade,canConfirm:false,participants:[{id:'owner',name:'Camila',role:'PROPIETARIO'}],confirmations:[{userId:'receiver',role:'RECEPTOR'}]};
 const waiting=digitalTransactionPresentation(mine,'receiver');assert.equal(waiting.group,'waiting');assert.equal(waiting.state,'ESPERANDO_OTRO');assert.equal(waiting.label,'Esperando a Camila');
 assert.equal(digitalTransactionPresentation({...trade,confirmations:[{userId:'receiver',role:'PROPIETARIO'}]},'receiver').group,'action');
 assert.equal(digitalTransactionPresentation({...trade,canConfirm:false},'receiver').group,'other');
 assert.equal(digitalTransactionPresentation({...mine,status:'COMPLETADA'},'receiver').state,'FINALIZADO');
 assert.equal(digitalTransactionPresentation({...mine,status:'CANCELADA'},'receiver').state,'CANCELADO');
 assert.equal(digitalTransactionPresentation({...trade,status:'UNKNOWN'},'receiver').state,undefined);
});

test('digital transactions use shared segments and sections, preserve inline panel closing and reset pagination on tab change',()=>{
 const h=runtime();let changes=0,query='';const confirmed={userId:'receiver',role:'RECEPTOR'};
 const rows=[{...trade,id:'wait',canConfirm:false,confirmations:[confirmed]},{...trade,id:'act'},{...trade,id:'other',canConfirm:false}];
 const state={value:{data:rows,meta:{page:1,limit:5,total:6,counts:{active:6,finished:2}}},loading:false,initialLoading:false,error:null,reload:()=>changes++,update:noop};
 const {DigitalActivityTransactions}=load('elibrary/components/DigitalActivityTransactions.tsx',{
  react:h.react,'react/jsx-runtime':jsx,'react-native':{View:'View',Text:'Text'},'@/features/auth/hooks/useAuth':{useAuth:()=>({identity:{userId:'receiver'}})},
  '../../components/AgreementUI':{AgreementCard:'Card',AgreementCardsSkeleton:'Skeleton',AgreementTabs:'Tabs',AgreementListSection:'Section'},'../../components/AgreementStepModal':{},'../../components/CatalogUI':{ui:{}},'../../components/RequestsUI':{RequestButton:'Button'},
  '../../components/ResourceDetailUI':{detailUI:{}},'../../components/PersonalUI':{PersonalEmpty:'Empty'},'../../components/TransactionUI':{},'../../components/OwnerRating':{},'../../components/MarketplaceReportForm':{},'../../hooks/useMarketplaceRefresh':{useMarketplaceRefresh:noop},'../../hooks/useAgreementPolling':{},
  '../hooks/useDigitalActivity':{useDigitalActivityPage:(kind,q)=>{query=q;return state;}},'../hooks/useDigitalTransactionPanel':{},'./DigitalActivityResource':{},'./DigitalActivityUI':{DigitalActivityPager:'Pager'},'../utils/digitalTransactionPresentation':{digitalTransactionPresentation},'../../utils/agreementPresentation':{agreementCopy},
 });
 const render=()=>elements(h.render(()=>DigitalActivityTransactions({active:true,onChanged:()=>changes++,onAcquired:noop})));
 let nodes=render();assert.deepEqual(nodes.filter(row=>row.type==='Card').map(row=>row.props.title??row.key),['act','wait','other']);
 assert.deepEqual(nodes.filter(row=>row.type==='Section'&&row.props.label).map(row=>row.props.label),['Requiere tu acción','Esperando a la otra persona','Consultar estado']);
 const tabs=nodes.find(row=>row.type==='Tabs');assert.equal(tabs.props.counts.active,6);assert.equal(tabs.props.selected,'active');
 const pager=nodes.find(row=>row.type==='Pager');assert.equal(pager.props.threshold,5);assert.match(pager.props.label,/activas/);pager.props.onChange(2);render();assert.match(query,/page=2/);
 nodes=render();nodes.find(row=>row.type==='Card').props.onSelect('confirm');nodes=render();assert.equal(nodes.find(row=>row.type==='Tabs').props.disabled,true);
 const modal=nodes.find(row=>row.type?.name==='DigitalTransactionModal');assert.equal(modal.props.initialPanel,'confirm');modal.props.onClose();nodes=render();assert.equal(changes,0);
 nodes.find(row=>row.type==='Tabs').props.onSelect('finished');render();assert.match(query,/tab=finished&page=1/);
 state.value={...state.value,data:[]};nodes=render();assert.equal(nodes.find(row=>row.type==='Empty').props.title,agreementCopy.emptyFinished);
 state.initialLoading=true;nodes=render();assert.ok(nodes.some(row=>row.type==='Skeleton'));assert.ok(!nodes.some(row=>row.type==='Empty'));
 state.initialLoading=false;state.error='Sin conexión';nodes=render();assert.ok(!nodes.some(row=>row.type==='Empty'));assert.ok(!nodes.some(row=>row.type==='Pager'));h.unmount();
});
function panel(initial=trade,viewer='receiver'){
 const h=runtime(),reads=[],writes=[],ratings=[],snapshots=[];
 const {useDigitalTransactionPanel}=load('elibrary/hooks/useDigitalTransactionPanel.ts',{react:h.react,'@/features/auth/hooks/useAuth':{useAuth:()=>({identity:{userId:viewer}})},'@/lib/api/authenticated-request':{AuthApiError},'../api/digitalTradesApi':{loadDigitalTrade:(...args)=>pending(reads,args),transitionDigitalTrade:(...args)=>pending(writes,args),rateDigitalOwner:(...args)=>pending(ratings,args)}});
 return {h,reads,writes,ratings,snapshots,render:()=>h.render(()=>useDigitalTransactionPanel(initial,value=>snapshots.push(value)))};
}
test('digital panel requires fresh permissions, sends one confirmation and stays locked through reconciliation',async()=>{
 const q=panel();let state=q.render();await state.run('confirm');assert.equal(q.writes.length,0);
 q.reads[0].resolve(trade);await setImmediate();state=q.render();assert.equal(state.verified,true);
 const operation=state.run('confirm');void state.run('confirm');assert.equal(q.writes.length,1);assert.equal(q.render().busy,true);
 q.writes[0].resolve({});await setImmediate();assert.equal(q.render().busy,true);assert.equal(q.reads.length,2);
 q.reads[1].resolve({...trade,status:'PENDIENTE_CONFIRMACION',canConfirm:false,confirmations:[{userId:'receiver',role:'RECEPTOR'}]});await operation;
 state=q.render();assert.equal(state.busy,false);assert.equal(state.fresh,true);assert.equal(state.trade.canConfirm,false);await state.run('confirm');assert.equal(q.writes.length,1);q.h.unmount();
});
test('digital rating recovers a lost response from the immutable receipt without duplicate submission',async()=>{
 const complete={...trade,status:'COMPLETADA',canConfirm:false,canRate:true},q=panel(complete);q.render();q.reads[0].resolve(complete);await setImmediate();let state=q.render();
 for(const score of [0,6,1.5])await state.run('rate',score);assert.equal(q.ratings.length,0);
 const operation=state.run('rate',4);void state.run('rate',4);assert.equal(q.ratings.length,1);q.ratings[0].reject(new Error('lost reply'));await setImmediate();
 q.reads[1].resolve({...complete,canRate:false,rating:{id:'rating',score:4}});await operation;state=q.render();assert.equal(state.error,null);assert.equal(state.trade.rating.score,4);await state.run('rate',4);assert.equal(q.ratings.length,1);q.h.unmount();
});
test('digital panel retains structure while refreshing and revokes its preview on denied read',async()=>{
 const q=panel();q.render();q.reads[0].resolve(trade);await setImmediate();let state=q.render();const refresh=state.read();state=q.render();assert.equal(state.verified,true);assert.equal(state.fresh,false);
 q.reads[1].reject(new AuthApiError(403));await refresh;state=q.render();assert.equal(state.verified,false);assert.ok(state.error);await state.run('confirm');assert.equal(q.writes.length,0);
 const next=state.read();q.h.unmount();assert.equal(q.reads[2].args[2].aborted,true);q.reads[2].resolve(trade);await next;
});
test('activity list retains rows during refresh, clears denied data and aborts previous page/context',async()=>{
 const h=runtime(),reads=[],counts=[];let identity={userId:'user',campusId:'campus'},query='page=1';
 const hooks=load('elibrary/hooks/useDigitalActivity.ts',{react:h.react,'@/features/auth/hooks/useAuth':{useAuth:()=>({identity})},'@/lib/api/authenticated-request':{AuthApiError},'../api/digitalActivityApi':{loadDigitalActivityPage:(...args)=>pending(reads,args),loadDigitalActivityCounts:(...args)=>pending(counts,args)}});
 const render=()=>h.render(()=>{const page=hooks.useDigitalActivityPage('requests',query);const badges=hooks.useDigitalActivityCounts();return {page,badges};});
 render();assert.equal(reads.length,1);assert.equal(counts.length,1);const value={data:[{id:'one'}],meta:{page:1,limit:10,hasMore:false,total:1}};reads[0].resolve(value);counts[0].resolve({pendingRequests:3});await setImmediate();
 let state=render();state.page.reload();state=render();assert.equal(state.page.initialLoading,false);assert.equal(state.page.value.data[0].id,'one');assert.equal(counts.length,1);
 reads[1].reject(new AuthApiError(403));await setImmediate();state=render();assert.equal(state.page.value,null);assert.ok(state.page.error);
 query='page=2';render();identity={userId:'other',campusId:'other-campus'};state=render();assert.equal(reads[2].args[2].aborted,true);assert.equal(state.page.value,null);assert.equal(state.badges.counts,null);h.unmount();
});
test('shared academic multi picker preserves selected IDs and removes only the chosen association',()=>{
 const {SearchableMultiSelect}=load('components/SearchableMultiSelect.tsx',{'react/jsx-runtime':jsx,'react-native':{View:'View',Text:'Text',Pressable:'Button'},'lucide-react-native':{X:'X'},'./SearchableFilterSelect':{SearchableFilterSelect:'Select'},'./CatalogUI':{ui:{},CATALOG_COLORS:{}}});
 const changes=[],tree=SearchableMultiSelect({label:'Carreras',options:[{id:'a',name:'Mismo nombre'},{id:'b',name:'Mismo nombre'}],values:['a'],onChange:ids=>changes.push(Array.from(ids)),expanded:true,onExpandedChange:noop});
 const nodes=elements(tree),select=nodes.find(row=>row.type==='Select');assert.deepEqual(Array.from(select.props.options,row=>row.id),['b']);select.props.onChange('b');nodes.find(row=>row.type==='Button').props.onPress();assert.deepEqual(changes,[['a','b'],[]]);
});
test('resource modal uses server totals and page rows without slicing the second page again',()=>{
 const h=runtime(),pages=[],orders=[];
 const {ResourceRequestsModal}=load('components/ResourceRequestsModal.tsx',{react:h.react,'react/jsx-runtime':jsx,'react-native':{View:'View',Text:'Text',TouchableOpacity:'Button',StyleSheet:{create:v=>v}},'lucide-react-native':{ChevronRight:'Chevron',Package:'Package',FileText:'File',Star:'Star',UserRound:'UserRound'},'@/components/Pagination':{Pagination:'Pagination'},'@/components/Skeleton':{Skeleton:'Skeleton',SkeletonBlock:'Block'},'./AgreementStepModal':{AgreementStepModal:'Modal'},'./CatalogUI':{CATALOG_COLORS:{}},'./RequestsUI':{RequestButton:'Action'},'@/types/colors':{APP_COLORS:{ACCENT:'#FDBB30'}}});
 const request={id:'eleven',name:'Estudiante 11',message:'Mensaje',requestedAt:'2026-10-24T12:00:00Z',status:'Esperando respuesta',tone:'pending',canAccept:true,canReject:true,onAccept:noop,onReject:noop};
 const nodes=elements(h.render(()=>ResourceRequestsModal({title:'Recurso',summary:'Donación',requests:[request],loading:false,error:null,onRefresh:noop,onClose:noop,pagination:{page:2,total:11,order:'oldest',onPageChange:page=>pages.push(page),onOrderChange:order=>orders.push(order)}})));
 assert.equal(nodes.filter(row=>row.props?.accessibilityLabel==='Revisar solicitud de Estudiante 11').length,1);
 const modal=nodes.find(row=>row.type==='Modal'),pager=elements(modal.props.footer).find(row=>row.type==='Pagination');assert.equal(pager.props.page,2);assert.equal(pager.props.totalPages,2);
 assert.equal(nodes.some(row=>row.props?.accessibilityLabel==='Aceptar solicitud de Estudiante 11'),false);
 nodes.filter(row=>row.props?.accessibilityRole==='tab')[1].props.onPress();assert.deepEqual(orders,['newest']);assert.deepEqual(pages,[1]);h.unmount();
});
test('digital activity uses four tabs, two transaction circles and inline options without delivery coordination',()=>{
 const list=renderCatalog('digital',{mode:'transactions'}).markup;for(const text of ['Publicaciones','Solicitudes','Transacciones','Adquiridos','Participantes','Monto acordado','Comprador (tú)'])assert.ok(list.includes(text),text);
 assert.match(list,/aria-label="Aceptada"/);assert.match(list,/aria-label="Confirmar"/);assert.doesNotMatch(list,/aria-label="Coordinar"/);
 const menu=renderCatalog('digital',{mode:'transactions',inlinePanel:'menu'}).markup;assert.match(menu,/Opciones de transacción/);assert.match(menu,/Denunciar transacción/);assert.match(menu,/Cancelar transacción/);assert.doesNotMatch(menu,/Ver solicitud|Volver a opciones/);
});

test('both transaction tabs use identical segmented styling; digital action/waiting/empty states keep their proper layout',()=>{
 const physical=renderCatalog('physical',{mode:'transactions'}).markup;
 const digital=renderCatalog('digital',{mode:'transactions'}).markup;
 const segments=markup=>markup.match(/<div[^>]*aria-label="Estado de las transacciones"[^>]*>/)?.[0];
 assert.ok(segments(physical));assert.ok(segments(digital));
 assert.equal(segments(physical).match(/class="([^"]+)"/)?.[1],segments(digital).match(/class="([^"]+)"/)?.[1]);
 assert.match(digital,/REQUIERE TU ACCIÓN/);assert.match(digital,/Falta tu confirmación/);
 const waiting=renderCatalog('digital',{mode:'transactions',transactionState:'waiting'}).markup;
 assert.match(waiting,/ESPERANDO A LA OTRA PERSONA/);assert.match(waiting,/Esperando a Camila González/);assert.doesNotMatch(waiting,/REQUIERE TU ACCIÓN/);
 const empty=renderCatalog('digital',{mode:'transactions',state:'empty'}).markup;assert.match(empty,/No tienes transacciones activas/);assert.doesNotMatch(empty,/No hay registros para mostrar/);
});
test('received decision is explicit, blocks duplicate acceptance through its read and closing does not reload the list',async()=>{
 const h=runtime(),writes=[],reads=[],resolved=[],row={id:'request',publicationId:'publication',title:'Recurso',requesterName:'Estudiante',status:'PENDIENTE',canResolve:true,canAccept:true,careers:[],message:'Mensaje',requestedAt:'2026-10-24T12:00:00Z'};
 let reloads=0,closes=0;const value={data:[row],meta:{page:1,limit:10,total:1}},state={value,loading:false,initialLoading:false,error:null,reload:()=>reloads++,update:change=>{state.value=change(state.value);}};
 const deps={react:h.react,'react/jsx-runtime':jsx,'react-native':{View:'View',Text:'Text'},'../../components/RequestsUI':{RequestSegments:'Segments',RequestButton:'Button',RequestDecisionDialog:'Decision'},'../../components/RequestAccordionCard':{},'../../components/ResourceRequestsModal':{ResourceRequestsModal:'Modal'},'../../hooks/useMarketplaceRefresh':{},'../hooks/useDigitalActivity':{useDigitalActivityPage:()=>state},'../api/digitalTradesApi':{resolveDigitalRequest:(...args)=>pending(writes,args)},'../api/digitalActivityApi':{loadDigitalActivityPage:(...args)=>pending(reads,args)},'./DigitalActivityResource':{},'./DigitalActivityUI':{digitalAmount:()=>'$1.000',digitalRequestPresentation:row=>({label:row.status,tone:row.status==='PENDIENTE'?'pending':'accepted'})}};
 const {Received}=load('elibrary/components/DigitalActivityRequests.tsx',deps,'\nmodule.exports.Received=DigitalReceivedRequests;');
 const render=()=>h.render(()=>Received({resource:{publicationId:'publication',title:'Recurso',total:1},onClose:()=>closes++,onResolved:decision=>resolved.push(decision),onUncertain:noop}));
 let modal=render();assert.equal(modal.props.overlay,undefined);modal.props.requests[0].onAccept();modal=render();modal.props.overlay.props.onConfirm();modal.props.overlay.props.onConfirm();assert.equal(writes.length,1);assert.equal(render().props.blocked,true);
 writes[0].resolve({});await setImmediate();assert.equal(reads.length,1);assert.equal(render().props.blocked,true);reads[0].resolve({data:[{...row,status:'ACEPTADA',canResolve:false,canAccept:false}],meta:value.meta});await setImmediate();
 modal=render();assert.equal(modal.props.blocked,false);assert.deepEqual(resolved,['ACEPTAR']);assert.equal(modal.props.requests[0].canAccept,false);modal.props.onClose();assert.equal(closes,1);assert.equal(reloads,0);h.unmount();
});
