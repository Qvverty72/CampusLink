import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import ts from 'typescript';

const require=createRequire(import.meta.url),native=require('react-native-web');
const source=fs.readFileSync(new URL('../src/features/marketplace/physicalgoods/components/PublishPhysicalgoods.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function publicationForm(reverse=false){
 const selected=[],noop=()=>{};
 const options={campus:{id:'campus',name:'Campus de prueba'},categories:[{id:'category-a',name:'Libros'},{id:'category-b',name:'Libros'}],careers:[{id:'career-a',name:'Informática'},{id:'career-b',name:'Informática'}],subjects:[{id:'subject-a',name:'MACHINE LEARNING',careerIds:['career-a']},{id:'subject-b',name:'MACHINE LEARNING',careerIds:['career-b']}]};
 if(reverse)for(const key of ['categories','careers','subjects'])options[key].reverse();
 const form={options,loading:false,busy:false,created:null,title:'Borrador',description:'Descripción',condition:'BUEN_ESTADO',categoryId:'category-b',careerId:'career-b',subjectId:'subject-b',modality:'DONACION',price:'',photos:[],error:null,setCategoryId:id=>selected.push(id),setCareerId:id=>selected.push(id),setSubjectId:id=>selected.push(id),setCondition:noop,setModality:noop};
 const mocks={react:{...React,useState:initial=>[initial,noop]},'react/jsx-runtime':require('react/jsx-runtime'),'react-native':native,'@/components/RefreshScrollView':{},'expo-router':{},'@/components/navigation/BottomNavigationBar':{},'@/features/auth/hooks/useAuth':{},'../hooks/usePublishPhysicalgoods':{usePublishPhysicalgoods:()=>form},'../hooks/usePhysicalgoodsResources':{},'../types/publication':{PHYSICALGOODS_MAX_IMAGES:3,resourceConditions:[{value:'BUEN_ESTADO',label:'Buen estado'}]}};
 mocks['../../components/CatalogUI']={CATALOG_COLORS:{primary:'#002E56'}}; mocks['lucide-react-native']={Gift:()=>null,Tag:()=>null,UploadCloud:()=>null};mocks['react-native-safe-area-context']={};
 for(const path of ['PhysicalgoodsResources','PublicationImages','PhysicalgoodsRequests','PhysicalgoodsTransaction','PhysicalgoodsHistory'])mocks['./'+path]={};
 const baseDir=fileURLToPath(new URL('../src/features/marketplace/components/',import.meta.url));
 function shared(filename){const module={exports:{}};const content=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(content,{module,exports:module.exports,require:name=>name==='./CatalogUI'?mocks['../../components/CatalogUI']:Object.hasOwn(mocks,name)?mocks[name]:shared(path.resolve(path.dirname(filename),name+'.tsx'))});return module.exports;}
 mocks['../../components/PublicationFormUI']=shared(path.join(baseDir,'PublicationFormUI.tsx'));
 mocks['../../components/PublicationChoices']=shared(path.join(baseDir,'PublicationChoices.tsx'));
 const module={exports:{}};
 // Inspecciona el componente privado sin agregar exports a la API de producción.
 vm.runInNewContext(compiled+'\nmodule.exports.formForTest=PublicationForm;',{module,exports:module.exports,require:name=>{assert.ok(Object.hasOwn(mocks,name),name);return mocks[name];}});
 const tree=module.exports.formForTest({onPublished:noop,onGallery:noop}),radios=[];
 const visit=node=>{if(Array.isArray(node))return node.forEach(visit);if(!React.isValidElement(node))return;if(node.props.accessibilityRole==='radio')radios.push(node);if(typeof node.type==='function')visit(node.type(node.props));else visit(node.props.children);};
 visit(tree);return {radios,selected};
}
test('opciones con el mismo nombre conservan claves distintas y seleccionan su ID propio',()=>{
 const {radios,selected}=publicationForm();
 for(const [label,ids] of [['Libros',['category-a','category-b']],['Informática',['career-a','career-b']],['MACHINE LEARNING',['subject-a','subject-b']]]){
  const choices=radios.filter(node=>node.props.accessibilityLabel===label);
  assert.equal(choices.length,2,'No eliminar entidades por compartir nombre');
  assert.equal(new Set(choices.map(node=>node.key)).size,2,'Las claves React deben ser únicas');
  assert.deepEqual(choices.map(node=>node.key),ids);
  assert.deepEqual(choices.map(node=>node.props.accessibilityState.checked),[false,true]);
  choices.forEach(node=>node.props.onPress());
 }
 assert.deepEqual(selected,['category-a','category-b','career-a','career-b','subject-a','subject-b']);
});
test('reordenar opciones no cambia la identidad React de las asignaturas homónimas',()=>{
 const normal=publicationForm().radios.filter(node=>node.props.accessibilityLabel==='MACHINE LEARNING');
 const reordered=publicationForm(true).radios.filter(node=>node.props.accessibilityLabel==='MACHINE LEARNING');
 assert.deepEqual(normal.map(node=>node.key),['subject-a','subject-b']);
 assert.deepEqual(reordered.map(node=>node.key),['subject-b','subject-a']);
});
