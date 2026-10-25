import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {setImmediate} from 'node:timers/promises';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import {renderCatalog} from './helpers/marketplace-render.mjs';

function load(file,deps){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(new URL('../src/features/marketplace/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInNewContext(code,{module,exports:module.exports,AbortController,URLSearchParams,require:name=>{assert.ok(Object.hasOwn(deps,name),name);return deps[name];}});return module.exports;}
function runtime(){const slots=[];let index=0,effects=[];const react={useState(initial){const i=index++;if(!(i in slots))slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,value=>slots[i].value=typeof value==='function'?value(slots[i].value):value];},useCallback(fn,deps){const i=index++,old=slots[i];if(!old||deps.some((value,j)=>!Object.is(value,old.deps[j])))slots[i]={fn,deps};return slots[i].fn;},useEffect(fn,deps){const i=index++,old=slots[i];if(!old||deps.some((value,j)=>!Object.is(value,old.deps[j])))effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()};});}};return{react,render:fn=>{index=0;effects=[];const result=fn();effects.forEach(effect=>effect());return result;},unmount:()=>slots.forEach(slot=>slot?.cleanup?.())};}
const nodes=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(6).flatMap(nodes)];
const noop=()=>{};
const row=(id,status='DISPONIBLE')=>({id,title:id,status,isWithdrawn:false,canView:true,activity:{pendingRequests:0},campus:{id:'campus',name:'Campus'},modality:'VENTA',price:1000,publishedAt:'2026-10-25T12:00:00Z'});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};

test('publication API forwards an optional server tab and preserves the unfiltered contract',()=>{
 const calls=[],api=load('physicalgoods/api/physicalgoodsApi.ts',{'@/lib/api/authenticated-request':{authenticatedEnvelopeRequest:(...args)=>calls.push(args)}}),signal=new AbortController().signal;
 api.loadOwnPhysicalgoods(2,signal);api.loadOwnPhysicalgoods(1,signal,'reserved');
 assert.equal(calls[0][2].has('tab'),false);assert.equal(calls[1][2].get('tab'),'reserved');assert.equal(calls[1][2].get('page'),'1');assert.equal(calls[1][1].signal,signal);
});

function fixture(){
 const h=runtime(),calls=[],registered=[];let identity={userId:'owner',campusId:'campus'};
 const history={page:{data:[{...row('Hola'),activity:{pendingRequests:1}},row('Libro','RESERVADO'),row('Calculadora','FINALIZADO'),{...row('Retirada'),isWithdrawn:true,canView:false}],meta:{hasMore:true}},number:1,loading:false,error:null,reload:()=>calls.push('reload'),setNumber:value=>calls.push(value)};
 const ui=load('physicalgoods/components/PhysicalgoodsPublications.tsx',{react:h.react,'react/jsx-runtime':jsx,'react-native':{View:'View',Text:'Text'},'@/features/auth/hooks/useAuth':{useAuth:()=>({identity})},'@/components/RefreshScrollView':{useScrollRefresh:(...args)=>registered.push(args)},'../../components/ActivityUI':{ActivityFeedback:'Feedback',ActivityPager:'Pager'},'../../components/PublicationActivityUI':{PublicationActivityFilters:'Filters',PublicationActivityRow:'Row',PublicationActivitySkeleton:'Skeleton',publicationActivityUI:{}},'../hooks/usePhysicalgoodsHistory':{usePhysicalgoodsHistory:(...args)=>{calls.push({query:args});return history;}},'./PhysicalgoodsPublicationProduct':{PhysicalgoodsPublicationProduct:'Product'}});
 const props={active:true,refreshVersion:0,onDetail:value=>calls.push(value),onAgreement:(...args)=>calls.push(args),onRequests:()=>calls.push('requests'),onActivityRefresh:()=>calls.push('counts'),tab:'all'};
 return{h,calls,history,registered,ui,props,move:()=>identity={userId:'other',campusId:'campus'},page:()=>nodes(h.render(()=>ui.PhysicalgoodsPublicationsPage(props))),root:()=>nodes(h.render(()=>ui.PhysicalgoodsPublications(props)))};
}

test('publication filters key pages by state and account, resetting page and modal on filter changes',()=>{
 const q=fixture();let all=q.root(),page=all.find(node=>typeof node.type==='function');assert.equal(page.key,'owner:campus:all');
 all.find(node=>node.type==='Filters').props.onSelect('reserved');all=q.root();page=all.find(node=>typeof node.type==='function');assert.equal(page.props.tab,'reserved');assert.equal(page.key,'owner:campus:reserved');
 q.move();page=q.root().find(node=>typeof node.type==='function');assert.equal(page.props.tab,'all');assert.equal(page.key,'other:campus:all');q.h.unmount();
});

test('publication rows keep history, open the shared product without navigation and close without reloading',()=>{
 const q=fixture();let all=q.page(),rows=all.filter(node=>node.type==='Row');assert.equal(rows.length,4);assert.equal(rows[0].props.featured,true);assert.equal(rows[1].props.featured,false);assert.equal(rows[3].props.status,'Retirada');
 rows[0].props.onRequests();assert.ok(q.calls.includes('requests'));
 rows[0].props.onPress();all=q.page();let product=all.find(node=>node.type==='Product');assert.equal(product.props.publication.id,'Hola');assert.equal(q.registered.at(-1)[2],false);assert.ok(!q.calls.some(call=>call?.publicationId));
 q.history.loading=true;assert.ok(q.page().some(node=>node.type==='Skeleton'));assert.ok(q.page().some(node=>node.type==='Product'));q.history.loading=false;
 product.props.onClose();assert.ok(!q.page().some(node=>node.type==='Product'));assert.equal(q.calls.filter(call=>call==='reload').length,0);
 q.registered.at(-1)[0]();assert.deepEqual(q.calls.filter(call=>typeof call==='string'),['requests','counts','reload']);
 q.page().find(node=>node.type==='Pager').props.onNext();assert.ok(q.calls.includes(2));q.h.unmount();
});

test('previous-campus publications stay historical and empty state filters do not open the publish form',()=>{
 const q=fixture();q.history.page.data=[{...row('Otra sede'),canView:false,activity:{pendingRequests:3}}];let all=q.page();assert.equal(all.find(node=>node.type==='Row').props.featured,false);assert.ok(all.some(node=>node.props?.children==='HISTORIAL'));
 q.history.page.data=[];q.props.tab='reserved';q.props.onPublish=()=>assert.fail('must not publish from a filter refresh');all=q.page();const feedback=all.find(node=>node.type==='Feedback');assert.equal(feedback.props.onEmptyAction,undefined);feedback.props.onReload();assert.ok(q.calls.includes('reload'));q.h.unmount();
});

test('publication product uses authorized owner reader and current fields, retaining management and active transaction',()=>{
 const reads=[],state={product:{title:'Nombre actualizado',status:'RESERVADO',modality:'VENTA',price:2000,canView:true,activeTransaction:{id:'tx',status:'RESERVADA'}},loading:false,error:null,unavailable:false},calls=[];
 const {PhysicalgoodsPublicationProduct}=load('physicalgoods/components/PhysicalgoodsPublicationProduct.tsx',{'react/jsx-runtime':jsx,'react-native':{Text:'Text',View:'View'},'../../components/AgreementProductUI':{AgreementProductModal:'Modal'},'../../components/PersonalUI':{PersonalStatus:'Status'},'../../components/RequestsUI':{RequestButton:'Action'},'../../components/ResourceDetailUI':{detailUI:{}},'./PhysicalgoodsAgreementProduct':{PhysicalgoodsProductCard:'Card'},'../hooks/usePhysicalgoodsAgreementProduct':{usePhysicalgoodsAgreementProduct:(...args)=>{reads.push(args);return state;}}});
 const render=()=>nodes(PhysicalgoodsPublicationProduct({publication:row('resource'),onClose:noop,onManage:()=>calls.push('manage'),onAgreement:(...args)=>calls.push(args)}));
 let all=render();assert.equal(reads[0][0].role,'PROPIETARIO');assert.equal(all[0].props.title,'Recurso de la publicación');const card=all.find(node=>node.type==='Card');assert.equal(card.props.detail.publication.title,'Nombre actualizado');assert.equal(card.props.detail.amount,2000);assert.match(card.props.dateLabel,/Publicado el/);
 all.find(node=>node.props?.label==='Gestionar publicación').props.onPress();all.find(node=>node.props?.label==='Ver transacción').props.onPress();assert.deepEqual(calls,['manage',['resource','tx']]);
 state.product={...state.product,canView:false,isWithdrawn:true,activeTransaction:null};all=render();assert.ok(!all.some(node=>node.type==='Action'));assert.equal(all.find(node=>node.type==='Status').props.status,'RETIRADA');
});

test('publication reads abort on filter and identity changes and ignore late server results',async()=>{
 const h=runtime(),reads=[];let tab='active',identity={userId:'me',campusId:'campus'};
 const {usePhysicalgoodsHistory}=load('physicalgoods/hooks/usePhysicalgoodsHistory.ts',{react:h.react,'@/features/auth/hooks/useAuth':{useAuth:()=>({identity,refreshIdentity:noop})},'@/lib/api/authenticated-request':{AuthApiError:class extends Error{}},'../api/physicalgoodsApi':{loadOwnPhysicalgoods:(...args)=>{const result=deferred();reads.push({...result,args});return result.promise;}}});
 const render=()=>h.render(()=>usePhysicalgoodsHistory(true,false,0,tab));render();assert.equal(reads[0].args[2],'active');
 tab='reserved';render();assert.equal(reads[0].args[1].aborted,true);reads[0].resolve({data:[row('old')],meta:{}});reads[1].resolve({data:[row('reserved','RESERVADO')],meta:{}});await setImmediate();assert.equal(render().page.data[0].id,'reserved');
 identity={userId:'other',campusId:'campus'};render();h.unmount();assert.equal(reads[2].args[1].aborted,true);
});

test('real publications screen and shared modal render loading, history and authorized detail states',()=>{
 const options={mode:'personal',variant:'mine'};
 const ready=renderCatalog('physical',options).markup;for(const text of ['Mis publicaciones','Todas','Activas','Reservadas','Finalizadas','REQUIERE TU ACCIÓN','HISTORIAL'])assert.ok(ready.includes(text),text);
 const product=renderCatalog('physical',{...options,publicationOpen:'physical-0'}).markup;assert.match(product,/Recurso de la publicación/);assert.match(product,/Gestionar publicación/);assert.doesNotMatch(product,/Confirmar que se realizó|Participantes/);
 const loading=renderCatalog('physical',{...options,publicationOpen:'physical-0',publicationProductState:'loading'}).markup;assert.match(loading,/Recurso de la publicación/);assert.doesNotMatch(loading,/Gestionar publicación/);
 const history=renderCatalog('physical',{...options,publicationOpen:'physical-2'}).markup;assert.match(history,/Retirada/);assert.doesNotMatch(history,/Gestionar publicación/);
});
