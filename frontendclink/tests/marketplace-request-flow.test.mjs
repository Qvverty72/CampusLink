import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { renderCatalog } from './helpers/marketplace-render.mjs';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

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

const elements = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(4).flatMap(elements)];
const noop=()=>{};
const native={View:'View',Text:'Text',Pressable:'Button',Image:'Image',Modal:'Modal',StyleSheet:{create:value=>value}};
const detail={detailUI:{},RequestResourceSummary:'Summary',DetailHeader:'Header',DetailActionBar:'Footer',ResourceDetailSkeleton:'Skeleton'};
const flow=load('components/RequestFlowUI.tsx',{'react/jsx-runtime':jsx,'react-native':native,'lucide-react-native':{Check:'Check'},
 './CatalogUI':{CATALOG_COLORS:{},ui:{}},'./PersonalUI':{PersonalStatus:'Status',personalStatusLabel:value=>value.toLowerCase()},'./ResourceDetailUI':detail});

test('timeline reflects pending, acceptance, completion and both cancellation sources without inventing progress',()=>{
 const steps=flow.requestTimelineSteps;
 assert.deepEqual(Array.from(steps('PENDIENTE'),row=>row.done),[true,false,false]);
 assert.deepEqual(Array.from(steps('PENDIENTE'),row=>row.current),[false,true,false]);
 assert.deepEqual(Array.from(steps('ACEPTADA','RESERVADA'),row=>row.done),[true,true,false]);
 assert.equal(steps('ACEPTADA','RESERVADA')[2].current,true);
 assert.deepEqual(Array.from(steps('ACEPTADA','COMPLETADA'),row=>row.done),[true,true,true]);
 for(const[status,transaction,label]of[['RECHAZADA',undefined,'Solicitud rechazada'],['CANCELADA',undefined,'Solicitud cancelada'],['ACEPTADA','CANCELADA','Acuerdo cancelado']]){
  const rows=steps(status,transaction);assert.equal(rows.at(-1).label,label);assert.equal(rows.at(-1).terminal,true);assert.equal(rows.at(-1).done,false);assert.ok(rows.every(row=>!row.current));
 }
 assert.equal(steps('PENDIENTE',undefined,true)[2].label,'Completar acuerdo');
 assert.equal(steps('PENDIENTE',undefined,false,true)[2].label,'Entrega y confirmación');
});

test('sent confirmation uses actual owner, preserves donation wording and does not promise payment or acceptance',()=>{
 const tree=flow.RequestSentConfirmation({title:'Libro',ownerName:'Camila',modality:'DONACION',price:null,status:'PENDIENTE'});
 const text=JSON.stringify(elements(tree));assert.match(text,/Solicitud enviada/);assert.match(text,/Camila/);assert.match(text,/acepta o rechaza/);assert.doesNotMatch(text,/Pagan/);
 const rejected=JSON.stringify(elements(flow.RequestSentConfirmation({title:'Libro',ownerName:'Camila',modality:'VENTA',price:1000,status:'RECHAZADA'})));
 assert.doesNotMatch(rejected,/recibirá un aviso|Qué sigue/);
});

test('history detail retains exact navigation and forbids public opening when only historical access is allowed',()=>{
 const calls=[], row={id:'request',status:'PENDIENTE',campus:{name:'Campus'},owner:{fullName:'Camila'},requester:{fullName:'Diego'},requestedAt:'2026-10-24T12:00:00Z',message:'Me interesa',publication:{id:'pub',title:'Libro',modality:'VENTA',price:1000,status:'DISPONIBLE',canView:true},transaction:null};
 const state={detail:row,loading:false,error:null,reload:noop};
 const {PhysicalgoodsHistoryDetail}=load('physicalgoods/components/PhysicalgoodsHistory.tsx',{react:{useCallback:fn=>fn},'react/jsx-runtime':jsx,'react-native':native,'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:30,bottom:20})},
 '@/components/RefreshScrollView':{RefreshScrollView:'Refresh',useScrollRefresh:noop},'../hooks/usePhysicalgoodsHistory':{usePhysicalgoodsHistoryDetail:()=>state},
 '../../components/CatalogUI':{CATALOG_COLORS:{}},'../../components/ResourceDetailUI':detail,'../../components/PersonalUI':{PersonalStatus:'Status'},'../../components/RequestFlowUI':{RequestTimeline:'Timeline'},
 './PhysicalgoodsAgreements':{PhysicalgoodsAgreements:'Agreements'},'./PhysicalgoodsPublications':{PhysicalgoodsPublications:'Publications'},'../../components/ActivityUI':{},'../types/publication':{resourceConditions:[]}});
 const render=()=>elements(PhysicalgoodsHistoryDetail({target:{publicationId:'pub',requestId:'request'},onClose:()=>calls.push('close'),onOpen:id=>calls.push(id),onAgreement:(...args)=>calls.push(args)}));
 let nodes=render();nodes.find(row=>row.type==='Header').props.onBack();nodes.find(row=>row.type==='Footer').props.onPress();assert.deepEqual(calls,['close','pub']);
 assert.equal(nodes.find(row=>row.type==='Refresh').props.onRefresh,noop);assert.equal(nodes.find(row=>row.type==='Timeline').props.status,'PENDIENTE');
 row.publication.canView=false;assert.equal(render().some(row=>row.type==='Footer'),false);
 row.transaction={id:'trade',status:'RESERVADA'};nodes=render();nodes.find(row=>row.type==='Footer').props.onPress();assert.deepEqual(calls.at(-1),['pub','trade']);
 state.loading=true;assert.equal(render().some(row=>row.type==='Footer'),false);
});

test('real sent confirmation has two actions; owner and active requests keep their protections',()=>{
 const sent=renderCatalog('physical',{mode:'request',variant:'active'}).markup;
 for(const text of ['Solicitud enviada','Camila González','Qué sigue','Ver mi solicitud','Volver al mercado'])assert.ok(sent.includes(text),text);
 assert.doesNotMatch(sent,/Solicitud registrada|Mensajes disponibles/);
 const own=renderCatalog('physical',{mode:'detail',variant:'own'}).markup;assert.match(own,/No puedes solicitar tu propia publicación/);assert.match(own,/aria-disabled="true"/);
});

test('real request details render lifecycle states and keep history independent of public visibility',()=>{
 for(const[variant,label]of[['available','Esperando respuesta'],['accepted','Solicitud aceptada'],['rejected','Solicitud rechazada'],['cancelled','Solicitud cancelada'],['completed','Completada'],['agreement-cancelled','Acuerdo cancelado']]){
  const markup=renderCatalog('physical',{mode:'request-detail',variant,width:360}).markup;
  assert.ok(markup.includes(label),label);assert.match(markup,/Detalle de solicitud/);assert.doesNotMatch(markup,/Cerrar detalle del historial|Actualizar detalle del historial/);
 }
 assert.doesNotMatch(renderCatalog('physical',{mode:'request-detail',variant:'historical'}).markup,/Abrir recurso en mi campus/);
 assert.match(renderCatalog('physical',{mode:'request-detail',state:'loading'}).markup,/Cargando detalle del recurso/);
 assert.match(renderCatalog('physical',{mode:'request-detail',state:'error'}).markup,/Reintentar detalle/);
});

test('empty inboxes provide the intended recovery and received counts identify their page scope',()=>{
 const sent=renderCatalog('physical',{mode:'requests',variant:'sent',state:'empty'}).markup;assert.match(sent,/Aún no has enviado solicitudes/);assert.match(sent,/Explorar mercado/);
 const received=renderCatalog('physical',{mode:'requests',variant:'received',receivedScenario:'mixed',receivedOpen:'physical-0',receivedSelected:'request-0'}).markup;assert.doesNotMatch(received,/pendientes en esta página/);assert.match(received,/Recibidas, 4 pendientes/);assert.match(received,/Diego Pérez/);assert.match(received,/Aceptar solicitud de Diego/);
 assert.match(renderCatalog('physical',{mode:'requests',state:'empty'}).markup,/No tienes solicitudes pendientes/);
});

test('received resource list opens request modal with the shared ten-request paginator and historical protections',()=>{
 const options={mode:'requests',variant:'received',receivedScenario:'many'};
 const closed=renderCatalog('physical',options).markup;assert.match(closed,/10 solicitudes · 0 transacciones pendientes/);assert.doesNotMatch(closed,/Revisar solicitud de|Más antiguas/);
 const open=renderCatalog('physical',{...options,receivedOpen:'physical-0'}).markup;
 assert.equal((open.match(/aria-label="Revisar solicitud de/g)||[]).length,10);assert.match(open,/Estudiante 10/);assert.doesNotMatch(open,/Aceptar solicitud de|Rechazar solicitud de/);assert.match(open,/Ingeniería en Informática/);assert.match(open,/Páginas de solicitudes del recurso/);
 const selected=renderCatalog('physical',{...options,receivedOpen:'physical-0',receivedSelected:'request-2'}).markup;assert.match(selected,/Aceptar solicitud de Mateo Rojas/);assert.doesNotMatch(selected,/Aceptar solicitud de Diego Pérez/);
 const second=renderCatalog('physical',{...options,receivedScenario:'eleven',receivedOpen:'physical-0',receivedPage:2}).markup;assert.match(second,/Estudiante 11/);assert.equal((second.match(/aria-label="Revisar solicitud de/g)||[]).length,1);
 const reserved=renderCatalog('physical',{...options,receivedScenario:'reserved',receivedOpen:'physical-0',receivedSelected:'request-0'}).markup;assert.match(reserved,/Las demás solicitudes siguen pendientes/);assert.doesNotMatch(reserved,/Ver solicitud|Ver transacción/);
 const historical=renderCatalog('physical',{...options,receivedScenario:'historical',receivedOpen:'physical-0'}).markup;assert.doesNotMatch(historical,/Aceptar solicitud de|Rechazar solicitud de/);assert.match(historical,/Publicación retirada/);
 assert.match(renderCatalog('physical',{...options,state:'loading'}).markup,/Cargando solicitudes recibidas/);
 const refreshing=renderCatalog('physical',{...options,receivedOpen:'physical-0',receivedLoading:true}).markup;assert.match(refreshing,/Cargando detalle de solicitudes/);
 const decision=renderCatalog('physical',{...options,receivedOpen:'physical-0',receivedDecision:'ACEPTAR'}).markup;
 assert.equal((decision.match(/data-qa-modal-portal="true"/g)||[]).length,1);assert.match(decision,/Confirmar aceptación/);
});

test('received list distinguishes unhandled requests, accepted transactions, a single confirmation and completed exchanges',()=>{
 const options={mode:'requests',variant:'received',receivedScenario:'indicators'};
 const pending=renderCatalog('physical',options).markup;assert.match(pending,/Recibidas, 1 pendiente/);assert.match(pending,/Transacción finalizada/);assert.doesNotMatch(pending,/pendiente en esta página|pendientes en esta página/);
 for(const receivedScenario of ['indicators-accepted','indicators-confirming']){const accepted=renderCatalog('physical',{...options,receivedScenario,receivedOpen:'physical-0',receivedSelected:'request-0'}).markup;assert.match(accepted,/Recibidas, 1 pendiente/);assert.match(accepted,/1 transacción pendiente/);assert.doesNotMatch(accepted,/Ver solicitud|Ver transacción/);}
 const finished=renderCatalog('physical',{...options,receivedScenario:'indicators-completed'}).markup;assert.match(finished,/Recibidas, 0 pendientes/);assert.equal((finished.match(/Transacción finalizada/g)||[]).length,2);
 const expanded=renderCatalog('physical',{...options,receivedOpen:'physical-1',receivedSelected:'finished-request'}).markup;
 assert.match(expanded,/El intercambio se completó/);assert.match(expanded,/aria-expanded="true"/);
 assert.doesNotMatch(expanded,/Ver solicitud|Ver transacción/);
});

test('both request badges are visible before the selected request list finishes loading',()=>{
 for(const variant of ['sent','received']){
   const {markup}=renderCatalog('physical',{mode:'requests',variant,state:'loading',requestCounts:{sentAccepted:3,receivedPending:12}});
   assert.match(markup,/Enviadas, 3 solicitudes aceptadas/);assert.match(markup,/Recibidas, 12 pendientes/);
   assert.match(markup,/Cargando solicitudes/);assert.doesNotMatch(markup,/Cargando contador de/);
 }
 const pending=renderCatalog('physical',{mode:'requests',variant:'sent',state:'loading',requestCountsLoading:true}).markup;
 assert.match(pending,/Cargando contador de enviadas/);assert.match(pending,/Cargando contador de recibidas/);
});

test('real sent accordion shows only the selected message and preserves historical resource restrictions',()=>{
 const accepted=renderCatalog('physical',{mode:'requests',variant:'sent',sentScenario:'mixed',sentOpen:'request-0'}).markup;
 assert.match(accepted,/Carlos aceptó tu solicitud/);assert.match(accepted,/Monto acordado/);assert.doesNotMatch(accepted,/Solicitud enviada/);assert.match(accepted,/Tú, mensaje enviado el/);
 assert.match(accepted,/aria-expanded="true"/);assert.match(accepted,/aria-expanded="false"/);
 assert.doesNotMatch(accepted,/Aceptar solicitud de|Rechazar solicitud de|Tú, Carlos Soto|Ver transacción|Ver solicitud: Sushi/);
 const collapsed=renderCatalog('physical',{mode:'requests',variant:'sent',sentScenario:'mixed',sentOpen:null}).markup;
 assert.doesNotMatch(collapsed,/aria-expanded="true"|Me interesa este recurso para mis estudios/);assert.match(collapsed,/Bicicleta urbana/);
 const history=renderCatalog('physical',{mode:'requests',variant:'sent',sentScenario:'historical',sentOpen:'request-0',sentResource:'historical'}).markup;
 assert.match(history,/Recurso de la solicitud/);assert.match(history,/no están disponibles/);assert.doesNotMatch(history,/Ver transacción|Ver solicitud: Sushi/);
 const loading=renderCatalog('physical',{mode:'requests',variant:'sent',state:'loading'}).markup;
 assert.match(loading,/Cargando solicitudes enviadas/);assert.doesNotMatch(loading,/Aún no has enviado solicitudes/);
});

test('received requester headers show their received reputation in both domains with an honest unrated state',()=>{
 const physical=renderCatalog('physical',{mode:'requests',variant:'received',receivedScenario:'reserved',receivedOpen:'physical-0'}).markup;
 assert.match(physical,/Valoración de Diego Pérez: 5,0 de 5\. 1 valoración/);
 assert.match(physical,/5,0 · 1 valoración/);assert.match(physical,/fill="#FDBB30"/);
 assert.match(physical,/Sin valoraciones todavía/);assert.match(physical,/Ingeniería en Informática/);
 assert.doesNotMatch(physical,/Aceptar solicitud de|Rechazar solicitud de/);
 const digital=renderCatalog('digital',{mode:'agreements',receivedOpen:'digital-0',receivedScenario:'digital'}).markup;
 assert.match(digital,/Valoración de Diego Pérez: 4,5 de 5\. 2 valoraciones/);
 assert.match(digital,/4,5 · 2 valoraciones/);assert.match(digital,/Sin valoraciones todavía/);
 assert.match(digital,/Me interesa este recurso para mis estudios/);
 const loading=renderCatalog('physical',{mode:'requests',variant:'received',receivedScenario:'single',receivedOpen:'physical-0',receivedLoading:true}).markup;
 assert.match(loading,/Cargando detalle de solicitudes/);assert.doesNotMatch(loading,/5,0 · 1 valoración/);
});

test('received list displays active transactions first, unanswered resources by age and completed last',()=>{
 const {markup}=renderCatalog('physical',{mode:'requests',variant:'received',receivedScenario:'priority'});
 const titles=['Mouse','Calculadora','Libro de física','Sushi'];
 for(let i=0;i<titles.length-1;i++)assert.ok(markup.indexOf(titles[i])<markup.indexOf(titles[i+1]),titles[i]);
 assert.match(markup,/1 transacción pendiente/);assert.match(markup,/Transacción finalizada/);
});

test('request resource modal reuses the product view for pending requests and keeps its loading/error states',()=>{
 const options={mode:'requests',variant:'sent',sentScenario:'mixed',sentOpen:'request-1',sentResource:'ready'};
 const pending=renderCatalog('physical',options).markup;
 for(const text of ['Recurso de la solicitud','Bicicleta urbana','Bicicleta urbana en buen estado','Participantes','Comprador (tú)','Solicitud enviada el'])assert.ok(pending.includes(text),text);
 assert.match(pending,/45\.000/);assert.doesNotMatch(pending,/Recurso de la transacción|Confirmar que se realizó|Iniciado el/);
 assert.match(renderCatalog('physical',{...options,sentResource:'loading'}).markup,/Cargando información del recurso/);
 assert.match(renderCatalog('physical',{...options,sentResource:'error'}).markup,/Reintentar información/);
});
