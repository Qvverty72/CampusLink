import { loadSafeArea } from './helpers/safe-area.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as jsx from 'react/jsx-runtime';
import ts from 'typescript';

const source=fs.readFileSync(new URL('../src/features/marketplace/physicalgoods/components/PublishPhysicalgoods.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const orderModule={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/features/marketplace/physicalgoods/utils/orderPhysicalgoodsCategories.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:orderModule,exports:orderModule.exports});
const elements=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(6).flatMap(elements)];
function publicationForm(reverse=false){
 const selected=[],noop=()=>{};let openField=null;
 const options={campus:{id:'campus',name:'Campus de prueba'},categories:[{id:'category-a',name:'Libros'},{id:'category-b',name:'Libros'}],careers:[{id:'career-a',name:'Informática'},{id:'career-b',name:'Informática'}],subjects:[{id:'subject-a',name:'MACHINE LEARNING'},{id:'subject-b',name:'MACHINE LEARNING'}]};
 if(reverse)for(const key of ['categories','careers','subjects'])options[key].reverse();
 const form={options,loading:false,busy:false,created:null,title:'Borrador',description:'Descripción',condition:'BUEN_ESTADO',categoryId:'category-b',careerId:'career-b',subjectId:'subject-b',modality:'DONACION',price:'',photos:[],error:null,
  setCategoryId:id=>selected.push(id),setCareerId:id=>selected.push(id),setSubjectId:id=>selected.push(id),setCondition:noop,setModality:noop,reload:noop,publish:noop};
 const mocks={react:{useState:()=>[openField,value=>{openField=value;}]},'react/jsx-runtime':jsx,'react-native':{View:'View',Text:'Text',TextInput:'Input',Pressable:'Button',StyleSheet:{create:v=>v}},
  '../../utils/agreementPresentation':{agreementCopy:{}},'@/components/RefreshScrollView':{},'expo-router':{},'@/components/navigation/BottomNavigationBar':{},'@/features/auth/hooks/useAuth':{},
  '../hooks/usePublishPhysicalgoods':{usePublishPhysicalgoods:()=>form},'../hooks/usePhysicalgoodsResources':{},'../types/publication':{PHYSICALGOODS_MAX_IMAGES:3,resourceConditions:[{value:'BUEN_ESTADO',label:'Buen estado'}]},
  '../hooks/usePhysicalgoodsRequestCounts':{},'../../components/CatalogUI':{},'../../components/SearchableFilterSelect':{SearchableFilterSelect:'Select'},'../../components/PublicationFormUI':{publicationUI:{},PublicationSection:'Section',PublicationModality:'Modality',PublicationUpload:'Upload',PublicationSubmit:'Submit'},'react-native-safe-area-context':{}};
 for(const name of ['PhysicalgoodsResources','PublicationImages','PhysicalgoodsRequests','PhysicalgoodsTransaction','PhysicalgoodsHistory'])mocks['./'+name]={[name]:name};
 mocks['../utils/orderPhysicalgoodsCategories']=orderModule.exports;
 const module={exports:{}};
 vm.runInNewContext(compiled+'\nmodule.exports.formForTest=PublicationForm;',{module,exports:module.exports,require:name=>{if (name === '@/lib/layout/safeArea') return loadSafeArea(mocks['react-native']?.Platform?.OS); assert.ok(Object.hasOwn(mocks,name),name);return mocks[name];}});
 const render=()=>elements(module.exports.formForTest({onPublished:noop,onGallery:noop}));
 return {render,selected,form,selectors:()=>render().filter(node=>node.type==='Select')};
}
test('publicar conserva catálogos homónimos y sus IDs al elegir o reordenar',()=>{
 for(const reverse of [false,true]){
  const f=publicationForm(reverse),selectors=f.selectors().slice(1);
  for(const [index,prefix] of ['category','career','subject'].entries()){
   const field=selectors[index].props,ids=Array.from(field.options,row=>row.id);
   assert.deepEqual(ids,reverse?[prefix+'-b',prefix+'-a']:[prefix+'-a',prefix+'-b']);
   assert.equal(field.value,prefix+'-b');field.onChange(prefix+'-a');
  }
  assert.deepEqual(f.selected,['category-a','career-a','subject-a']);
 }
});
test('formulario abre un desplegable a la vez y conserva campos obligatorios y académicos opcionales',()=>{
 const f=publicationForm();let fields=f.selectors();assert.equal(fields.length,4);assert.ok(fields.every(row=>!row.props.expanded));
 f.form.options.categories.unshift({id:'other',name:'Otros'});f.form.categoryId='other';fields=f.selectors();
 assert.equal(fields[1].props.options.at(-1).id,'other');assert.equal(fields[1].props.value,'other');assert.equal(f.form.options.categories[0].id,'other');
 for(let index=0;index<4;index++){
  fields[index].props.onExpandedChange(true);fields=f.selectors();assert.equal(fields.filter(row=>row.props.expanded).length,1);assert.equal(fields[index].props.expanded,true);
 }
 assert.ok(fields.slice(0,2).every(row=>row.props.allowEmpty===false&&row.props.searchable===false));
 for(const [index,label] of [[2,'Sin carrera'],[3,'Sin asignatura']]){assert.equal(fields[index].props.searchRequired,true);assert.equal(fields[index].props.emptyLabel,label);}
 assert.ok(f.render().some(node=>node.type==='Modality'));assert.ok(f.render().some(node=>node.type==='PublicationImages'));
 assert.doesNotMatch(JSON.stringify(f.render()),/Campus de origen|Actualizar opciones/);
 f.form.busy=true;assert.ok(f.selectors().every(row=>row.props.disabled));
});
