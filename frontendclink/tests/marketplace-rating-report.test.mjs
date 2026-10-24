import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { renderCatalog } from './helpers/marketplace-render.mjs';
const noop=()=>{};
function load(file,deps,extra=''){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(new URL('../src/features/marketplace/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
vm.runInNewContext(code+extra,{module,exports:module.exports,require:name=>{assert.ok(Object.hasOwn(deps,name),name);return deps[name];}});return module.exports;}
const native={View:'View',Text:'Text',TextInput:'Input',Pressable:'Button',StyleSheet:{create:value=>value}};
const shared={'react/jsx-runtime':jsx,'react-native':native,'lucide-react-native':{Check:'Check',Flag:'Flag',Star:'Star'},'./CatalogUI':{CATALOG_COLORS:{primary:'#002E56'}},'./PublicationFormUI':{publicationUI:{},PublicationFeedback:'Feedback',PublicationSubmit:'Submit'},'@/types/colors':{APP_COLORS:{ACCENT:'#FDBB30'}}};
const elements=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(5).flatMap(elements)];
const reasons=load('types/report.ts',{}).MARKETPLACE_REPORT_REASONS;
function report(target={type:'PUBLICACION_FISICA',publicationId:'publication'}){const slots=[],writes=[],state={busy:false,error:null,receipt:null,submit:input=>writes.push(input)};let cursor=0;
 const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},useEffect:noop};
 const {fields}=load('components/MarketplaceReportForm.tsx',{...shared,react,'@/features/auth/hooks/useAuth':{},'@/features/reports/hooks/useContentReport':{useContentReport:()=>state},'../types/report':{MARKETPLACE_REPORT_REASONS:reasons}},'\nmodule.exports.fields=ReportFields;');
 return{writes,state,render(){cursor=0;return fields({target,title:'Recurso',onBack:noop});}};}
test('denuncia: opción envía texto del contrato existente; otro motivo conserva entrada libre y trim',()=>{
 const q=report();let tree=q.render();const find=label=>elements(tree).find(node=>node.props?.accessibilityLabel===label);
 assert.equal(elements(tree).find(node=>node.type==='Submit').props.disabled,true);
 find('Información engañosa').props.onPress();tree=q.render();elements(tree).find(node=>node.type==='Submit').props.onPress();assert.equal(q.writes[0].reason,'Información engañosa');assert.equal('description' in q.writes[0],false);
 find('Otro motivo').props.onPress();tree=q.render();find('Otro motivo de denuncia').props.onChangeText('  Caso particular  ');find('Descripción de la denuncia').props.onChangeText('  Detalles  ');tree=q.render();elements(tree).find(node=>node.type==='Submit').props.onPress();assert.equal(q.writes[1].reason,'Caso particular');assert.equal(q.writes[1].description,'Detalles');
});
test('denuncia: motivo de intercambio solo en acuerdo; fallos conservan selección y envío bloqueado no repite',()=>{
 const publication=report();assert.ok(!elements(publication.render()).some(node=>node.props?.accessibilityLabel==='Problema con el intercambio'));
 const q=report({type:'TRANSACCION_DIGITAL',publicationId:'publication',transactionId:'trade',campusId:'campus'});let tree=q.render();assert.ok(elements(tree).some(node=>node.props?.accessibilityLabel==='Problema con el intercambio'));
 elements(tree).find(node=>node.props?.accessibilityLabel==='Spam o publicidad').props.onPress();q.state.error='No se pudo confirmar';tree=q.render();assert.equal(elements(tree).find(node=>node.type==='Feedback').props.error,'No se pudo confirmar');assert.equal(elements(tree).find(node=>node.props?.accessibilityLabel==='Spam o publicidad').props['aria-checked'],true);
 q.state.busy=true;tree=q.render();const send=elements(tree).find(node=>node.type==='Submit');assert.equal(send.props.disabled,true);send.props.onPress();assert.equal(q.writes.length,0);
 q.state.receipt={reportedAt:'2026-10-24T12:00:00Z'};tree=q.render();assert.ok(!elements(tree).some(node=>node.type==='Submit'||node.type==='Input'));
});
test('valoración: selector entero1..5, envío deshabilitado sin puntuación y recibo inmutable sin acciones',()=>{
 const {OwnerRating}=load('components/OwnerRating.tsx',shared),selected=[];
 const props={canRate:true,score:null,confirming:false,disabled:false,onSelect:value=>selected.push(value),onPrepare:noop,onSend:noop,onCancel:noop};
 let nodes=elements(OwnerRating(props));assert.equal(nodes.find(node=>node.type==='Submit').props.disabled,true);const radios=nodes.filter(node=>node.props?.accessibilityRole==='radio');assert.equal(radios.length,5);radios.forEach(node=>node.props.onPress());assert.deepEqual(selected,[1,2,3,4,5]);
 nodes=elements(OwnerRating({...props,score:4,confirming:true}));assert.equal(nodes.filter(node=>node.props?.accessibilityRole==='radio').length,0);assert.equal(nodes.find(node=>node.type==='Submit').props.label,'Confirmar valoración');
 nodes=elements(OwnerRating({...props,rating:{score:4,createdAt:'2026-10-24T12:00:00Z'}}));assert.equal(nodes.filter(node=>node.type==='Submit'||node.props?.accessibilityRole==='radio').length,0);
});
for(const screen of ['physical','digital'])test(`${screen}: completado muestra valoración; recibo sustituye selector; denuncia accesible`,()=>{
 assert.match(renderCatalog(screen,{mode:'transaction',variant:'rating'}).markup,/Enviar valoración/);
 const rated=renderCatalog(screen,{mode:'transaction',variant:'rated'}).markup;assert.match(rated,/Valoración registrada: 4 de 5/);assert.doesNotMatch(rated,/Enviar valoración/);
 const html=renderCatalog(screen,{mode:'report'}).markup;assert.match(html,/radiogroup/);assert.match(html,/Enviar denuncia/);assert.match(html,/no elimina el contenido/);
});
