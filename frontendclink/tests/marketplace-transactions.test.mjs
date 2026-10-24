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
function physicalHook(){const h=runtime(),details=[],messages=[],options=[],writes=[],sends=[];let changed=0;
 const pending=(rows,args)=>{const value=deferred();rows.push({...value,args});return value.promise;};
 const {usePhysicalgoodsTransaction}=load('physicalgoods/hooks/usePhysicalgoodsTransaction.ts',{react:h.react,'@/features/auth/hooks/useAuth':{useAuth:()=>({identity:{userId:'owner',campusId:'campus'},refreshIdentity:noop})},'@/lib/api/authenticated-request':{AuthApiError},
 '../api/physicalgoodsApi':{loadPhysicalgoodsTransaction:(...args)=>pending(details,args),loadPhysicalgoodsCoordinationMessages:(...args)=>pending(messages,args),loadPhysicalgoodsCoordinationOptions:(...args)=>pending(options,args),changePhysicalgoodsTransaction:(...args)=>pending(writes,args),sendPhysicalgoodsCoordination:(...args)=>pending(sends,args)}});
 return{h,details,messages,options,writes,sends,get changed(){return changed;},render:()=>h.render(()=>usePhysicalgoodsTransaction({publicationId:'publication',transactionId:'trade'},()=>changed++))};}
async function readyPhysical(q){q.render();q.details[0].resolve(physical);q.messages[0].resolve({data:[],meta:{hasMore:false}});await setImmediate();q.render();return q.render();}
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
function sharedUI(){return load('components/TransactionUI.tsx',{'@/components/Skeleton':{Skeleton:'Skeleton',SkeletonBlock:'Block'},'react/jsx-runtime':jsx,'react-native':native,'lucide-react-native':{},'./CatalogUI':{CATALOG_COLORS:{},StatusTag:'Status',ui:{}},'./ResourceDetailUI':{detailUI:{}},'./RequestsUI':{RequestButton:'Action',requestStatusLabel:value=>value,requestUI:{}}});}
test('shared progress keeps physical coordination optional, digital has two steps, and only valid role confirmations count',()=>{
 const {TransactionProgress,participantConfirmation,TransactionActions}=sharedUI();
 const physical=JSON.stringify(elements(TransactionProgress({status:'RESERVADA',confirmedCount:0})));const digital=JSON.stringify(elements(TransactionProgress({status:'PENDIENTE_CONFIRMACION',confirmedCount:1,digital:true})));
 assert.match(physical,/Coordinar entrega/);assert.doesNotMatch(digital,/Coordinar entrega/);assert.match(digital,/Ambos confirman/);
 assert.equal(participantConfirmation({id:'owner',role:'PROPIETARIO'},[{userId:'owner',role:'RECEPTOR',confirmedAt:stamp}]),undefined);
 const waiting=JSON.stringify(elements(TransactionActions({status:'PENDIENTE_CONFIRMACION',mineConfirmed:true,canConfirm:false,canCancel:true,digital:true,disabled:false,onSelect:noop})));assert.match(waiting,/Esperando a la otra parte/);assert.doesNotMatch(waiting,/'Descargar'/);
 const completed=elements(TransactionActions({status:'COMPLETADA',mineConfirmed:true,canConfirm:false,canCancel:false,disabled:false,onSelect:noop}));assert.equal(completed.filter(n=>n.type==='Action'||n.type==='Button').length,0);
});

test('physical transaction renders location choices and preview, waiting, historical read-only and independent map error',()=>{
 const ready=renderCatalog('physical',{mode:'transaction',width:320}).markup;
 for(const text of ['Solicitud aceptada','Coordinar entrega','Ambos confirman','Seleccionar edificio','Seleccionar piso','Estoy en Edificio Central, en Piso 1.','Enviar mensaje','Confirmar que se realizó','Cancelar transacción','Mensajes de coordinación'])assert.ok(ready.includes(text),text);
 assert.doesNotMatch(ready,/<textarea/);
 const waiting=renderCatalog('physical',{mode:'transaction',variant:'waiting'}).markup;assert.match(waiting,/Esperando a la otra parte/);
 const historical=renderCatalog('physical',{mode:'transaction',variant:'historical'}).markup;assert.match(historical,/Consulta histórica/);assert.doesNotMatch(historical,/Seleccionar edificio|Confirmar que se realizó|Cancelar transacción|Confirma tu parte/);
 const mapError=renderCatalog('physical',{mode:'transaction',variant:'map-error'}).markup;assert.match(mapError,/Reintentar ubicaciones/);assert.match(mapError,/Confirmar que se realizó/);
});

test('digital detail has two steps, never exposes original downloads before both confirm, and sends completed receivers to acquired',()=>{
 const waiting=renderCatalog('digital',{mode:'transaction',variant:'waiting',width:320}).markup;assert.match(waiting,/Esperando a la otra parte/);assert.match(waiting,/1 de 2/);assert.doesNotMatch(waiting,/Descargar|Abrir en Adquiridos|Coordinar entrega|Seleccionar edificio/);
 const completed=renderCatalog('digital',{mode:'transaction',variant:'completed'}).markup;assert.match(completed,/2 de 2/);assert.match(completed,/Abrir en Adquiridos/);assert.doesNotMatch(completed,/Cancelar acuerdo|Confirmar acuerdo/);
 const cancelled=renderCatalog('digital',{mode:'transaction',variant:'cancelled'}).markup;assert.match(cancelled,/Acuerdo cancelado/);assert.doesNotMatch(cancelled,/Abrir en Adquiridos|Cancelar acuerdo|Confirmar acuerdo/);
});

test('physical cancellation dialog preserves withdrawn resources and digital cancellation describes only that agreement',()=>{
 const physical=renderCatalog('physical',{mode:'transaction',variant:'withdrawn-cancel'}).markup;assert.match(physical,/Confirmar cancelación/);assert.match(physical,/publicación seguirá retirada/);assert.match(physical,/Volver sin cambios/);
 const digital=renderCatalog('digital',{mode:'transaction',variant:'cancel-dialog'}).markup;assert.match(digital,/Los demás acuerdos y la publicación no cambian/);assert.match(digital,/sin conceder acceso/);
});

for(const screen of ['physical','digital'])test(`${screen}: opening agreement uses a skeleton and retries the same detail after a failed read`,()=>{
 const loading=renderCatalog(screen,{mode:'transaction',state:'loading'}).markup;assert.match(loading,/Cargando acuerdo/);assert.doesNotMatch(loading,/Condiciones originales del acuerdo/);
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
