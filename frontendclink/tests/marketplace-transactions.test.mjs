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

class AuthApiError extends Error {}
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const stamp='2026-10-23T12:00:00Z';
const physical={id:'trade',publication:{id:'publication',title:'Calculadora',status:'RESERVADO',isWithdrawn:false},campus:{id:'campus',name:'Origen'},owner:{id:'owner',fullName:'Camila'},receiver:{id:'receiver',fullName:'Diego'},role:'PROPIETARIO',status:'RESERVADA',modality:'VENTA',amount:12000,currency:'CLP',startedAt:stamp,completedAt:null,cancelledAt:null,confirmations:[],canConfirm:true,canCancel:true,canRate:false};
const digital={id:'trade',publicationId:'publication',title:'Guía',campusId:'campus',ownerId:'owner',receiverId:'receiver',status:'RESERVADA',modality:'VENTA',amount:2500,currency:'CLP',startedAt:stamp,completedAt:null,cancelledAt:null,confirmations:[],canConfirm:true,canCancel:true,canRate:false};
function physicalHook(){const h=runtime(),details=[],messages=[],options=[],writes=[],sends=[],ratings=[];let changed=0;
 const pending=(rows,args)=>{const value=deferred();rows.push({...value,args});return value.promise;};
 const {usePhysicalgoodsTransaction}=load('physicalgoods/hooks/usePhysicalgoodsTransaction.ts',{react:h.react,'@/features/auth/hooks/useAuth':{useAuth:()=>({identity:{userId:'owner',campusId:'campus'},refreshIdentity:noop})},'@/lib/api/authenticated-request':{AuthApiError},
 '../api/physicalgoodsApi':{loadPhysicalgoodsTransaction:(...args)=>pending(details,args),loadPhysicalgoodsCoordinationMessages:(...args)=>{const promise=pending(messages,args);const row=messages.at(-1);args.at(-1).addEventListener('abort',()=>row.resolve({data:[],meta:{hasMore:false}}),{once:true});return promise;},loadPhysicalgoodsCoordinationOptions:(...args)=>pending(options,args),ratePhysicalgoodsOwner:(...args)=>pending(ratings,args),changePhysicalgoodsTransaction:(...args)=>pending(writes,args),sendPhysicalgoodsCoordination:(...args)=>pending(sends,args)}});
 return{h,details,messages,options,writes,sends,ratings,get changed(){return changed;},render:()=>h.render(()=>usePhysicalgoodsTransaction({publicationId:'publication',transactionId:'trade'},()=>changed++))};}
async function readyPhysical(q,value=physical){q.render();q.details[0].resolve(value);q.messages[0].resolve({data:[],meta:{hasMore:false}});await setImmediate();q.render();return q.render();}

test('single-step confirmation and rating block duplicates through revalidation and reconcile lost replies',async()=>{
 const q=physicalHook();let state=await readyPhysical(q);const pending=state.confirmExchange();void state.confirmExchange();assert.equal(q.writes.length,1);assert.equal(state.action,null);
 q.writes[0].resolve({});await pending;await state.confirmExchange();assert.equal(q.writes.length,1);q.render();state=q.render();assert.equal(state.loading,true);assert.equal(state.operation,'confirm');assert.equal(state.detail,physical);
 const completed={...physical,status:'COMPLETADA',role:'RECEPTOR',canConfirm:false,canCancel:false,canRate:true,owner:{id:'seller',fullName:'Camila'},receiver:{id:'owner',fullName:'Diego'},rating:null};q.details.at(-1).resolve(completed);await setImmediate();state=q.render();assert.equal(state.operation,null);await state.submitRating();assert.equal(q.ratings.length,0);
 state.selectRating(5);state=q.render();const rating=state.submitRating();void state.submitRating();assert.equal(q.ratings.length,1);assert.equal(state.ratingConfirmation,false);q.ratings[0].reject(new Error('lost response'));await rating;await state.submitRating();assert.equal(q.ratings.length,1);
 q.render();state=q.render();assert.equal(state.loading,true);assert.equal(state.ratingScore,5);assert.equal(state.operation,'rating');q.details.at(-1).resolve({...completed,canRate:false,rating:{id:'saved',score:5,createdAt:stamp}});await setImmediate();state=q.render();assert.equal(state.error,null);assert.equal(state.ratingScore,null);assert.equal(state.detail.rating.score,5);assert.equal(state.operation,null);await state.submitRating();assert.equal(q.ratings.length,1);q.h.unmount();
});

test('confirmation pull reads only detail, keeps cached sections and guards duplicate pulls and decisions',async()=>{
 const q=physicalHook();let state=await readyPhysical(q);q.options[0].resolve({buildings:[]});await setImmediate();state=q.render();const before={detail:state.detail,messages:state.messages,options:state.options},counts={detail:q.details.length,messages:q.messages.length,options:q.options.length};
 assert.equal(state.detailRefreshing,false);state.refreshDetail();state.refreshDetail();state.selectAction('confirm');q.render();state=q.render();assert.equal(state.detailRefreshing,true);assert.equal(state.loading,true);assert.equal(state.detail,before.detail);assert.equal(state.messages,before.messages);assert.equal(state.options,before.options);assert.equal(state.action,null);assert.equal(q.details.length,counts.detail+1);assert.equal(q.messages.length,counts.messages);assert.equal(q.options.length,counts.options);
 q.details.at(-1).resolve({...physical,confirmations:[{userId:'receiver',role:'RECEPTOR',confirmedAt:stamp}]});await setImmediate();state=q.render();assert.equal(state.detailRefreshing,false);assert.equal(state.detail.confirmations.length,1);assert.equal(q.changed,0);assert.equal(q.options.length,counts.options);
 state.selectAction('confirm');state=q.render();state.refreshDetail();q.render();assert.equal(q.details.length,counts.detail+1);q.h.unmount();
});

test('physical revalidation retains detail, messages and locations and polling does not refetch unchanged map permissions',async()=>{
 const q=physicalHook();let state=await readyPhysical(q);const places={buildings:[{id:'building',name:'Edificio',floors:[{id:'floor',name:'Piso 1'}]}]};q.options[0].resolve(places);await setImmediate();state=q.render();const messages=state.messages,detail=state.detail;
 state.reload();q.render();state=q.render();assert.equal(state.loading,true);assert.equal(state.detail,detail);assert.equal(state.messages,messages);assert.equal(state.options,places);assert.equal(state.messagesLoading,false);assert.equal(q.options.length,2);
 state.selectAction('confirm');assert.equal(q.render().action,null);await state.confirm();assert.equal(q.writes.length,0);
 q.details.at(-1).resolve({...physical});q.messages.at(-1).resolve(messages);q.options.at(-1).resolve(places);await setImmediate();state=q.render();assert.equal(state.loading,false);assert.equal(q.options.length,2);
 const poll=state.poll({messages:false});q.details.at(-1).resolve({...physical,confirmations:[{userId:'receiver',role:'RECEPTOR',confirmedAt:stamp}]});await poll;state=q.render();assert.equal(state.detail.confirmations.length,1);assert.equal(q.options.length,2);
 state.reloadOptions();q.render();q.options.at(-1).reject(new Error('map offline'));await setImmediate();state=q.render();assert.equal(state.options,places);assert.ok(state.optionsError);state.setBuilding('building');state=q.render();state.setFloor('floor');state=q.render();assert.ok(state.preview);const count=q.messages.length,pending=state.send();assert.equal(q.messages.length,count);await pending;assert.equal(q.sends.length,0);q.h.unmount();
});

test('a failed revalidation keeps readable data but blocks writes, and forbidden detail revokes the cached view',async()=>{
 const q=physicalHook();let state=await readyPhysical(q);q.options[0].resolve({buildings:[]});await setImmediate();state=q.render();state.reload();q.render();q.details.at(-1).reject(new Error('offline'));await setImmediate();state=q.render();assert.ok(state.detail);assert.ok(state.error);state.selectAction('confirm');state=q.render();assert.equal(state.action,null);await state.confirm();assert.equal(q.writes.length,0);
 state.reload();q.render();const denied=new AuthApiError('Forbidden');denied.status=403;q.details.at(-1).reject(denied);await setImmediate();state=q.render();assert.equal(state.detail,null);assert.equal(state.accessDenied,true);await state.cancel();assert.equal(q.writes.length,0);q.h.unmount();
});
function digitalHook(viewer='owner'){const h=runtime(),details=[],lists=[],writes=[],ratings=[];const pending=(rows,args)=>{const value=deferred();rows.push({...value,args});return value.promise;};
 const {useDigitalTradeCenter}=load('elibrary/hooks/useDigitalTrades.ts',{react:h.react,'@/features/auth/hooks/useAuth':{useAuth:()=>({identity:{userId:viewer}})},'@/lib/api/authenticated-request':{AuthApiError},'@/lib/api/operation-id':{},
 '../api/digitalTradesApi':{loadDigitalRequests:(...args)=>pending(lists,args),loadDigitalTrade:(...args)=>pending(details,args),transitionDigitalTrade:(...args)=>pending(writes,args),rateDigitalOwner:(...args)=>pending(ratings,args)}});
 return{h,details,lists,writes,ratings,render:()=>h.render(()=>useDigitalTradeCenter(true))};}
async function readyDigital(q,value=digital){q.render();q.lists[0].resolve({data:[],meta:{hasMore:false}});await setImmediate();let state=q.render();const pending=state.showTrade({publicationId:'publication',transactionId:'trade',title:'Guía'});q.render();q.details[0].resolve(value);await pending;q.render();return q.render();}

test('physical map failure cannot block confirmation, which requires a decision and never writes twice',async()=>{
 const q=physicalHook();let state=await readyPhysical(q);q.options[0].reject(new Error('Mongo down'));await setImmediate();state=q.render();assert.ok(state.optionsError);assert.equal(state.error,null);
 await state.confirm();assert.equal(q.writes.length,0);state.selectAction('confirm');state=q.render();assert.equal(q.writes.length,0);const pending=state.confirm();state.confirm();assert.equal(q.writes.length,1);assert.equal(q.writes[0].args[1],'confirm');
 q.writes[0].reject(new Error('lost reply'));await pending;q.render();q.render();q.details.at(-1).resolve({...physical,status:'PENDIENTE_CONFIRMACION',canConfirm:false,confirmations:[{userId:'owner',role:'PROPIETARIO',confirmedAt:stamp}]});q.messages.at(-1).resolve({data:[],meta:{hasMore:false}});await setImmediate();state=q.render();assert.equal(state.error,null);assert.equal(state.detail.status,'PENDIENTE_CONFIRMACION');assert.equal(q.writes.length,1);assert.equal(q.changed,1);q.h.unmount();
});

test('physical cancellation can be dismissed, and historical/terminal permissions cannot be bypassed',async()=>{
 const q=physicalHook();let state=await readyPhysical(q);q.options[0].resolve({buildings:[]});await setImmediate();state=q.render();state.selectAction('cancel');state=q.render();assert.equal(state.action,'cancel');state.cancelAction();state=q.render();await state.cancel();assert.equal(q.writes.length,0);
 state.reload();q.render();q.details.at(-1).resolve({...physical,canConfirm:false,canCancel:false,campus:{id:'old',name:'Anterior'}});q.messages.at(-1).resolve({data:[],meta:{hasMore:false}});await setImmediate();state=q.render();assert.equal(state.historical,true);state.selectAction('cancel');state=q.render();assert.equal(state.action,null);await state.cancel();assert.equal(q.writes.length,0);q.h.unmount();
});

test('physical building changes reset floors, preserve exact names and send only validated IDs without free text',async()=>{
 const q=physicalHook();let state=await readyPhysical(q);q.options[0].resolve({buildings:[{id:'a',name:'Edificio A',floors:[{id:'ground',name:'Planta Baja'}]},{id:'b',name:'Biblioteca',floors:[{id:'minus',name:'Piso -1'}]}]});await setImmediate();state=q.render();state.setBuilding('a');state=q.render();state.setFloor('ground');state=q.render();assert.equal(state.preview,'Estoy en Edificio A, en Planta Baja.');state.setBuilding('b');state=q.render();assert.equal(state.floorId,'');assert.equal(state.preview,null);
 state.setFloor('ground');state=q.render();await state.send();assert.equal(q.sends.length,0);state.setFloor('minus');state=q.render();const pending=state.send();state.send();assert.equal(q.messages.length,2);q.messages.at(-1).resolve({data:[],meta:{hasMore:false}});await setImmediate();assert.equal(q.sends.length,1);assert.deepEqual(Array.from(q.sends[0].args.slice(1,3)),['b','minus']);assert.equal(q.sends[0].args.length,4);q.sends[0].resolve({});await pending;assert.equal(q.changed,0);q.h.unmount();
});

test('coordination retry reads only its own source, leaving the agreement and its actions intact',async()=>{
 const q=physicalHook();let state=await readyPhysical(q);q.options[0].reject(new Error('map'));await setImmediate();state=q.render();const count=q.details.length;state.reloadOptions();q.render();assert.equal(q.details.length,count);assert.equal(q.options.length,2);q.options[1].resolve({buildings:[]});await setImmediate();state=q.render();assert.equal(state.optionsError,null);assert.equal(state.detail.canConfirm,true);state.reloadMessages();q.render();assert.equal(q.details.length,count);q.h.unmount();
});

test('digital transition requires explicit confirmation, serializes writes and recovers an uncertain single confirmation',async()=>{
 const q=digitalHook();let state=await readyDigital(q);await state.transition();assert.equal(q.writes.length,0);state.selectTransition('cancel');state=q.render();state.cancelTransition();state=q.render();await state.transition();assert.equal(q.writes.length,0);
 state.selectTransition('confirm');state=q.render();const pending=state.transition();state.transition();assert.equal(q.writes.length,1);assert.equal(q.writes[0].args[1],'confirm');q.writes[0].reject(new Error('lost reply'));await setImmediate();assert.equal(q.details.length,2);q.details[1].resolve({...digital,status:'PENDIENTE_CONFIRMACION',canConfirm:false,confirmations:[{userId:'owner',role:'PROPIETARIO',confirmedAt:stamp}]});await pending;state=q.render();assert.equal(state.error,null);assert.equal(state.trade.status,'PENDIENTE_CONFIRMACION');assert.equal(q.writes.length,1);assert.equal(q.lists.length,1);q.h.unmount();
});

test('digital retry targets the opened agreement, aborts stale reads on close and does not load another inbox',async()=>{
 const q=digitalHook();let state=await readyDigital(q);const count=q.lists.length;state.reload();state=q.render();assert.equal(state.loading,true);assert.equal(q.details[1].args[0],'publication');assert.equal(q.details[1].args[1],'trade');assert.equal(q.lists.length,count);
 state.closeTrade();q.render();assert.equal(q.details[1].args[2].aborted,true);q.details[1].resolve({...digital,status:'COMPLETADA'});await setImmediate();state=q.render();assert.equal(state.trade,null);assert.equal(state.tradeTarget,null);q.h.unmount();
});

const native={View:'View',Text:'Text',Pressable:'Button',Modal:'Modal',ScrollView:'Scroll',StyleSheet:{create:value=>value}};
function sharedUI(){return load('components/TransactionUI.tsx',{'../utils/agreementPresentation':{agreementCopy:{}},'@/components/Skeleton':{Skeleton:'Skeleton',SkeletonBlock:'Block'},'react/jsx-runtime':jsx,'react-native':native,'lucide-react-native':{},'./CatalogUI':{CATALOG_COLORS:{},StatusTag:'Status',ui:{}},'./ResourceDetailUI':{detailUI:{}},'./RequestsUI':{RequestButton:'Action',requestStatusLabel:value=>value,requestUI:{}}});}
test('shared progress keeps physical coordination optional, digital has two steps, and only valid role confirmations count',()=>{
 const {TransactionProgress,participantConfirmation,TransactionActions}=sharedUI();
 const physical=JSON.stringify(elements(TransactionProgress({status:'RESERVADA',confirmedCount:0})));const digital=JSON.stringify(elements(TransactionProgress({status:'PENDIENTE_CONFIRMACION',confirmedCount:1,digital:true})));
 assert.match(physical,/Coordinar entrega/);assert.doesNotMatch(digital,/Coordinar entrega/);assert.match(digital,/Ambos confirman/);
 assert.equal(participantConfirmation({id:'owner',role:'PROPIETARIO'},[{userId:'owner',role:'RECEPTOR',confirmedAt:stamp}]),undefined);
 const waiting=JSON.stringify(elements(TransactionActions({status:'PENDIENTE_CONFIRMACION',mineConfirmed:true,canConfirm:false,canCancel:true,digital:true,disabled:false,onSelect:noop})));assert.match(waiting,/Esperando a la otra parte/);assert.doesNotMatch(waiting,/'Descargar'/);
 const completed=elements(TransactionActions({status:'COMPLETADA',mineConfirmed:true,canConfirm:false,canCancel:false,disabled:false,onSelect:noop}));assert.equal(completed.filter(n=>n.type==='Action'||n.type==='Button').length,0);
});

test('physical transaction renders location choices and preview, waiting, historical read-only and independent map error',()=>{
 const ready=renderCatalog('physical',{mode:'transaction',width:320,agreementPanel:'coordinate'}).markup;
 for(const text of ['Aceptada','Coordinar','Confirmar','Seleccionar edificio','Seleccionar piso','Estoy en Edificio Central, en Piso 1.','Avisar mi ubicación','Mensajes de coordinación'])assert.ok(ready.includes(text),text);
 assert.doesNotMatch(ready,/Confirmar que se realizó/);
 const confirm=renderCatalog('physical',{mode:'transaction',width:320,agreementPanel:'confirm'}).markup;
 assert.match(confirm,/Confirmaciones · 0 de 2/);assert.match(confirm,/Confirmar que se realizó/);assert.doesNotMatch(confirm,/Dónde estás/);
 assert.doesNotMatch(ready,/<textarea/);
 const waiting=renderCatalog('physical',{mode:'transaction',variant:'waiting',agreementPanel:'confirm'}).markup;assert.match(waiting,/Esperando a Diego Pérez/);assert.doesNotMatch(ready,/Actualizar mensajes|Cancelar transacción/);
 const historical=renderCatalog('physical',{mode:'transaction',variant:'historical',agreementPanel:'coordinate'}).markup;assert.match(historical,/Consulta histórica/);assert.match(historical,/Mensajes de coordinación/);assert.doesNotMatch(historical,/Seleccionar edificio|Confirmar que se realizó|Cancelar transacción|Confirma tu parte/);
 const mapError=renderCatalog('physical',{mode:'transaction',variant:'map-error',agreementPanel:'coordinate'}).markup;assert.match(mapError,/Reintentar ubicaciones/);
 assert.match(renderCatalog('physical',{mode:'transaction',variant:'map-error',agreementPanel:'confirm'}).markup,/Confirmar que se realizó/);
});

test('digital detail has two steps, never exposes original downloads before both confirm, and sends completed receivers to acquired',()=>{
 const waiting=renderCatalog('digital',{mode:'transaction',variant:'waiting',width:320}).markup;assert.match(waiting,/Esperando a la otra parte/);assert.match(waiting,/1 de 2/);assert.doesNotMatch(waiting,/Descargar|Abrir en Adquiridos|Coordinar entrega|Seleccionar edificio/);
 const completed=renderCatalog('digital',{mode:'transaction',variant:'completed'}).markup;assert.match(completed,/2 de 2/);assert.match(completed,/Abrir en Adquiridos/);assert.doesNotMatch(completed,/Cancelar acuerdo|Confirmar acuerdo/);
 const cancelled=renderCatalog('digital',{mode:'transaction',variant:'cancelled'}).markup;assert.match(cancelled,/Acuerdo cancelado/);assert.doesNotMatch(cancelled,/Abrir en Adquiridos|Cancelar acuerdo|Confirmar acuerdo/);
});

test('physical cancellation dialog preserves withdrawn resources and digital cancellation describes only that agreement',()=>{
 const physical=renderCatalog('physical',{mode:'transaction',variant:'withdrawn-cancel'}).markup;assert.match(physical,/Sí, cancelar/);assert.match(physical,/publicación seguirá retirada/);assert.match(physical,/Volver/);
 const digital=renderCatalog('digital',{mode:'transaction',variant:'cancel-dialog'}).markup;assert.match(digital,/Los demás acuerdos y la publicación no cambian/);assert.match(digital,/sin conceder acceso/);
});

for(const screen of ['physical','digital'])test(`${screen}: opening agreement uses a skeleton and retries the same detail after a failed read`,()=>{
 const loading=renderCatalog(screen,{mode:'transaction',state:'loading'}).markup;assert.match(loading,screen==='physical'?/Cargando transacción/:/Cargando acuerdo/);assert.doesNotMatch(loading,/Condiciones originales del acuerdo/);
 const error=renderCatalog(screen,{mode:'transaction',state:'error'}).markup;assert.match(error,/role="alert"/);assert.match(error,/Reintentar consulta del acuerdo/);assert.doesNotMatch(error,/No hay solicitudes/);
});

test('valoración digital: solo receptor completado, enteros1..5 y sin duplicar envío activo',async()=>{
 const complete={...digital,status:'COMPLETADA',canRate:true};
 for(const [viewer,value] of [['owner',complete],['receiver',{...complete,status:'RESERVADA'}],['receiver',{...complete,canRate:false}]]){
  const q=digitalHook(viewer);let state=await readyDigital(q,value);state.setScore(4);state=q.render();assert.equal(state.score,0);await state.rate();assert.equal(q.ratings.length,0);
 }
 const q=digitalHook('receiver');let state=await readyDigital(q,complete);for(const invalid of [0,1.5,6,NaN]){state.setScore(invalid);state=q.render();assert.equal(state.score,0);}
 state.setScore(5);state=q.render();const send=state.rate();void state.rate();assert.equal(q.ratings.length,1);assert.equal(q.ratings[0].args[1],5);q.ratings[0].resolve({score:5});await setImmediate();q.details.at(-1).resolve({...complete,canRate:false,rating:{id:'saved',score:5,createdAt:stamp}});await send;state=q.render();await state.rate();assert.equal(q.ratings.length,1);
});

test('valoración digital: respuesta perdida se recupera por recibo sin reenviar',async()=>{
 const complete={...digital,status:'COMPLETADA',canRate:true},q=digitalHook('receiver');let state=await readyDigital(q,complete);state.setScore(4);state=q.render();const send=state.rate();q.ratings[0].reject(new Error('response lost'));await setImmediate();q.details.at(-1).resolve({...complete,canRate:false,rating:{id:'rating',score:4,createdAt:stamp}});await send;state=q.render();assert.equal(state.error,null);assert.equal(state.trade.rating.score,4);assert.equal(state.score,0);await state.rate();assert.equal(q.ratings.length,1);
});

test('poll físico no muestra skeleton, no duplica lecturas y se cancela al recargar manualmente',async()=>{
 const q=physicalHook();let state=await readyPhysical(q);const count=q.details.length;const poll=state.poll();void state.poll();assert.equal(q.details.length,count+1);state=q.render();assert.equal(state.loading,false);assert.ok(state.detail);const stale=q.details.at(-1);state.reload();q.render();assert.equal(stale.args.at(-1).aborted,true);stale.resolve({...physical,status:'CANCELADA'});await poll;assert.notEqual(q.render().detail?.status,'CANCELADA');q.h.unmount();
});
test('poll digital actualiza confirmación sin escribir y se detiene en estados terminales',async()=>{
 const q=digitalHook();let state=await readyDigital(q);const poll=state.poll();void state.poll();assert.equal(q.details.length,2);state=q.render();assert.equal(state.loading,false);q.details.at(-1).resolve({...digital,status:'COMPLETADA',canConfirm:false,canCancel:false});await poll;state=q.render();assert.equal(state.trade.status,'COMPLETADA');await state.poll();assert.equal(q.details.length,2);assert.equal(q.writes.length,0);q.h.unmount();
});
test('poll digital pendiente se aborta antes de una mutación y no puede deshacerla',async()=>{
 const q=digitalHook();let state=await readyDigital(q);const poll=state.poll(),stale=q.details.at(-1);state.selectTransition('cancel');state=q.render();const mutation=state.transition();assert.equal(stale.args.at(-1).aborted,true);stale.resolve(digital);await poll;q.writes[0].resolve({});await setImmediate();q.details.at(-1).resolve({...digital,status:'CANCELADA',canConfirm:false,canCancel:false});await mutation;assert.equal(q.render().trade.status,'CANCELADA');q.h.unmount();
});

test('physical polling applies agreement changes without waiting for coordination and then updates messages',async()=>{
 const q=physicalHook();let state=await readyPhysical(q);q.options[0].resolve({buildings:[]});await setImmediate();state=q.render();const pending=state.poll();
 q.details.at(-1).resolve({...physical,status:'PENDIENTE_CONFIRMACION',confirmations:[{userId:'receiver',role:'RECEPTOR',confirmedAt:stamp}]});await setImmediate();state=q.render();assert.equal(state.detail.status,'PENDIENTE_CONFIRMACION');assert.equal(state.loading,false);
 q.messages.at(-1).resolve({data:[{id:'new',senderId:'receiver',text:'Estoy en Biblioteca, en Planta Baja.',createdAt:stamp}],meta:{hasMore:false}});await pending;state=q.render();assert.equal(state.messages.data[0].id,'new');assert.equal(q.writes.length,0);q.h.unmount();
});

const messagePage=id=>({data:[{id,senderId:'receiver',text:'Estoy en Biblioteca, en Planta Baja.',createdAt:stamp}],meta:{hasMore:true}});
async function coordinationReady(q){let state=await readyPhysical(q);q.options[0].resolve({buildings:[{id:'a',name:'Biblioteca',floors:[{id:'ground',name:'Planta Baja'}]}]});await setImmediate();state=q.render();state.setBuilding('a');state=q.render();state.setFloor('ground');return q.render();}

test('silent messages polling reads only the current page, preserves location and data, and avoids overlapping/unchanged updates',async()=>{
 const q=physicalHook();let state=await coordinationReady(q),details=q.details.length,options=q.options.length;
 const pending=state.pollMessages();void state.pollMessages();assert.equal(q.messages.length,2);assert.equal(q.details.length,details);assert.equal(q.options.length,options);
 state=q.render();assert.equal(state.loading,false);assert.equal(state.messagesLoading,false);assert.equal(state.messagesRefreshing,false);assert.equal(state.buildingId,'a');assert.equal(state.floorId,'ground');
 q.messages.at(-1).resolve(messagePage('new'));await pending;state=q.render();const before=state.messages;assert.equal(before.data[0].id,'new');
 const same=state.pollMessages();q.messages.at(-1).resolve(messagePage('new'));await same;state=q.render();assert.equal(state.messages,before);
 const background=state.pollMessages();q.messages.at(-1).reject(new Error('offline'));await background;state=q.render();assert.equal(state.messages,before);assert.equal(state.messageError,null);
 const agreementOnly=state.poll({messages:false}),messageCount=q.messages.length;q.details.at(-1).resolve(physical);await agreementOnly;assert.equal(q.messages.length,messageCount);assert.equal(q.writes.length,0);q.h.unmount();
});

test('manual messages refresh cancels silent reads, returns to page one and retains the thread/location without reloading the agreement',async()=>{
 const q=physicalHook();let state=await coordinationReady(q);state.setPage(2);q.render();q.messages.at(-1).resolve(messagePage('older'));await setImmediate();state=q.render();
 const before=state.messages,detailCount=q.details.length,optionsCount=q.options.length;
 const stale=state.pollMessages(),oldRequest=q.messages.at(-1);state.refreshMessages();state.refreshMessages();state=q.render();
 assert.equal(oldRequest.args.at(-1).aborted,true);await stale;assert.equal(state.page,1);assert.equal(state.messages,before);assert.equal(state.messagesRefreshing,true);assert.equal(state.messagesLoading,false);
 assert.equal(q.messages.at(-1).args[1],1);assert.equal(q.details.length,detailCount);assert.equal(q.options.length,optionsCount);assert.equal(state.preview,'Estoy en Biblioteca, en Planta Baja.');
 const count=q.messages.length;await state.pollMessages();assert.equal(q.messages.length,count);
 q.messages.at(-1).resolve(messagePage('latest'));await setImmediate();state=q.render();assert.equal(state.messages.data[0].id,'latest');assert.equal(state.messagesRefreshing,false);assert.equal(state.buildingId,'a');assert.equal(state.floorId,'ground');q.h.unmount();
});

test('manual messages errors keep visible messages and retry; closing aborts the request and clears its spinner',async()=>{
 const q=physicalHook();let state=await coordinationReady(q);const initial=state.messages;
 state.refreshMessages();q.render();q.messages.at(-1).reject(new Error('offline'));await setImmediate();state=q.render();assert.equal(state.messages,initial);assert.ok(state.messageError);assert.equal(state.messagesRefreshing,false);
 state.refreshMessages();q.render();q.messages.at(-1).resolve(messagePage('recovered'));await setImmediate();state=q.render();assert.equal(state.messageError,null);assert.equal(state.messages.data[0].id,'recovered');
 state.refreshMessages();state=q.render();const pending=q.messages.at(-1);state.cancelMessageRefresh();assert.equal(pending.args.at(-1).aborted,true);await setImmediate();state=q.render();assert.equal(state.messagesRefreshing,false);assert.equal(state.messages.data[0].id,'recovered');q.h.unmount();
});

test('a confirmation aborts pending silent messages before writing and unmount cancels its next read',async()=>{
 const q=physicalHook();let state=await coordinationReady(q);const pending=state.pollMessages(),request=q.messages.at(-1);
 state.selectAction('confirm');state=q.render();const write=state.confirm();assert.equal(request.args.at(-1).aborted,true);await pending;assert.equal(q.writes.length,1);
 q.writes[0].resolve({});await write;q.render();q.details.at(-1).resolve(physical);q.messages.at(-1).resolve(messagePage('fresh'));await setImmediate();state=q.render();
 const last=state.pollMessages(),read=q.messages.at(-1);q.h.unmount();assert.equal(read.args.at(-1).aborted,true);await last;
});

const poiBuildings=[{id:'a',name:'Edificio A',floors:[{id:'one',name:'Piso 1',pois:[{id:'library',name:'Biblioteca'}]},{id:'two',name:'Piso 2',pois:[]}]},{id:'b',name:'Edificio B',floors:[{id:'ground',name:'Planta Baja',pois:[]}]}];
async function poiReady(q){await readyPhysical(q);q.options[0].resolve({buildings:poiBuildings});await setImmediate();let state=q.render();state.setBuilding('a');state=q.render();state.setFloor('one');return q.render();}

test('optional POI preview and send use the selected floor/catalog names and only submit IDs',async()=>{
 const q=physicalHook();let state=await poiReady(q);state.setPoi('library');state=q.render();assert.equal(state.preview,'Estoy en Edificio A, en Piso 1, en Biblioteca.');
 const pending=state.send();q.messages.at(-1).resolve({data:[],meta:{hasMore:false}});await setImmediate();assert.equal(q.sends.length,1);assert.equal(q.sends[0].args[4],'library');assert.equal(q.sends[0].args[1],'a');assert.equal(q.sends[0].args[2],'one');assert.ok(q.sends[0].args[3] instanceof AbortSignal);assert.ok(!q.sends[0].args.includes('Biblioteca'));
 q.sends[0].resolve({});await pending;q.h.unmount();
});

test('POI hierarchy retains reselected parents, clears descendants on change and blocks an invalid point',async()=>{
 const q=physicalHook();let state=await poiReady(q);state.setPoi('library');state=q.render();state.setBuilding('a');state=q.render();state.setFloor('one');state=q.render();assert.equal(state.poiKey,'library');
 state.setPoi('missing');state=q.render();assert.equal(state.preview,null);await state.send();assert.equal(q.sends.length,0);
 state.setPoi('library');state=q.render();state.setFloor('two');state=q.render();assert.equal(state.poiKey,'');assert.equal(state.preview,'Estoy en Edificio A, en Piso 2.');
 state.setBuilding('b');state=q.render();assert.equal(state.floorId,'');assert.equal(state.poiKey,'');assert.equal(state.preview,null);q.h.unmount();
});

test('reloading location options clears a removed POI and keeps the valid floor-only location',async()=>{
 const q=physicalHook();let state=await poiReady(q);state.setPoi('library');state=q.render();state.reloadOptions();q.render();
 q.options.at(-1).resolve({buildings:[{id:'a',name:'Edificio A',floors:[{id:'one',name:'Piso 1',pois:[]}]}]});await setImmediate();state=q.render();assert.equal(state.poiKey,'');assert.equal(state.floorId,'one');assert.equal(state.preview,'Estoy en Edificio A, en Piso 1.');q.h.unmount();
});

test('coordination HTTP client preserves the old payload and adds only optional poiKey',async()=>{
 const calls=[],{sendPhysicalgoodsCoordination}=load('physicalgoods/api/physicalgoodsApi.ts',{'@/lib/api/authenticated-request':{authenticatedRequest:(...args)=>{calls.push(args);return Promise.resolve({});}}});
 const target={publicationId:'11111111-1111-4111-8111-111111111111',transactionId:'22222222-2222-4222-8222-222222222222'},signal=new AbortController().signal;
 await sendPhysicalgoodsCoordination(target,'a','one',signal);await sendPhysicalgoodsCoordination(target,'a','one',signal,'library');
 assert.deepEqual(JSON.parse(calls[0][1].body),{buildingId:'a',floorId:'one'});assert.deepEqual(JSON.parse(calls[1][1].body),{buildingId:'a',floorId:'one',poiKey:'library'});assert.equal(calls[1][1].signal,signal);
});

test('silent messages refresh preserves a failed POI send until a new matching server receipt confirms delivery',async()=>{
 const q=physicalHook();let state=await poiReady(q);state.setPoi('library');state=q.render();const text=state.preview;
 const pending=state.send();q.messages.at(-1).resolve({data:[],meta:{hasMore:false}});await setImmediate();q.sends[0].reject(new Error('lost response'));await pending;
 q.render();q.render();q.details.at(-1).resolve(physical);q.messages.at(-1).resolve({data:[],meta:{hasMore:false}});await setImmediate();state=q.render();assert.ok(state.messageError);
 const error=state.messageError,missing=state.pollMessages();q.messages.at(-1).resolve({data:[],meta:{hasMore:false}});await missing;state=q.render();assert.equal(state.messageError,error);
 const recovered=state.pollMessages();q.messages.at(-1).resolve({data:[{id:'receipt-poi',senderId:'owner',text,createdAt:stamp}],meta:{hasMore:false}});await recovered;state=q.render();assert.equal(state.messageError,null);assert.equal(q.sends.length,1);q.h.unmount();
});
