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
 const {PhysicalgoodsHistoryDetail}=load('physicalgoods/components/PhysicalgoodsHistory.tsx',{'react/jsx-runtime':jsx,'react-native':native,'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:30,bottom:20})},
 '@/components/RefreshScrollView':{RefreshScrollView:'Refresh',useScrollRefresh:noop},'../hooks/usePhysicalgoodsHistory':{usePhysicalgoodsHistoryDetail:()=>state},
 '../../components/CatalogUI':{CATALOG_COLORS:{}},'../../components/ResourceDetailUI':detail,'../../components/PersonalUI':{PersonalStatus:'Status'},'../../components/RequestFlowUI':{RequestTimeline:'Timeline'},
 './PhysicalgoodsAgreements':{PhysicalgoodsAgreements:'Agreements'},'../../components/ActivityUI':{},'../types/publication':{resourceConditions:[]}});
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
 const received=renderCatalog('physical',{mode:'requests'}).markup;assert.match(received,/2 pendientes en esta página/);assert.match(received,/Diego Pérez quiere/);assert.match(received,/Aceptar solicitud de Diego/);
 assert.match(renderCatalog('physical',{mode:'requests',state:'empty'}).markup,/No tienes solicitudes pendientes/);
});
