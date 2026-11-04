import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {setImmediate} from 'node:timers/promises';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import {renderCatalog} from './helpers/marketplace-render.mjs';
const noop=()=>{},nodes=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(6).flatMap(nodes)];
function load(file,deps){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(new URL('../src/features/marketplace/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInNewContext(code,{module,exports:module.exports,AbortController,require:name=>{assert.ok(Object.hasOwn(deps,name),name);return deps[name];}});return module.exports;}
function runtime(){const slots=[];let index=0,effects=[];const react={useState(initial){const i=index++;slots[i]??={value:typeof initial==='function'?initial():initial};return[slots[i].value,value=>slots[i].value=typeof value==='function'?value(slots[i].value):value];},useRef(initial){const i=index++;return slots[i]??={current:initial};},useEffect(fn,deps){const i=index++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()};});}};return{react,render:fn=>{index=0;effects=[];const result=fn();effects.forEach(fn=>fn());return result;}};}
const native={View:'View',Text:'Text',Pressable:'Button',TextInput:'Input',Image:'Image',ScrollView:'Scroll',ActivityIndicator:'Busy',StyleSheet:{create:v=>v}};
test('personal publication administration opens only its gallery and returns after withdrawal',()=>{
 const h=runtime(),reads=[],closed=[],resources={selectedId:null,open:id=>{reads.push(id);resources.selectedId=id;}};
 const {PhysicalgoodsPublicationManagement}=load('physicalgoods/components/PhysicalgoodsPublicationManagement.tsx',{react:h.react,'react/jsx-runtime':jsx,
 '../hooks/usePhysicalgoodsResources':{usePhysicalgoodsResources:catalogActive=>{assert.equal(catalogActive,false);return resources;}},'./PhysicalgoodsManagement':{PhysicalgoodsManagement:'Management'}});
 const onClose=()=>closed.push(true),render=()=>h.render(()=>PhysicalgoodsPublicationManagement({id:'mine',onClose}));
 let tree=render();assert.equal(tree.type,'Management');assert.equal(tree.props.resources,resources);assert.deepEqual(reads,['mine']);assert.equal(closed.length,0);
 render();resources.selectedId=null;render();assert.equal(closed.length,1);
});
function fixture(){
 const h=runtime(),calls=[],resource={id:'resource',owner:{id:'owner'},title:'Calculadora',description:'Con cubierta',condition:'BUEN_ESTADO',modality:'VENTA',price:12000,updatedAt:'original-version',canEdit:true,status:'DISPONIBLE',campus:{name:'San Andrés'},category:{id:'books',name:'Libros'},images:[{id:'photo-a',url:'a',principal:false},{id:'photo-b',url:'b',principal:true}]};
 const r={gallery:resource,selectedId:'resource',galleryLoading:false,galleryError:null,busy:false,options:{categories:[{id:'other',name:'Otros'},{id:'books',name:'Libros'}]},editCategory:'books',draftImages:[],remainingImageSlots:1,
 reloadGallery:()=>calls.push('reload'),reload:()=>calls.push('options'),setEditCategory:value=>{r.editCategory=value;},saveCategory:()=>calls.push(['category',r.editCategory]),principal:id=>calls.push(['principal',id]),retire:id=>calls.push(['retire',id]),removeDraft:i=>calls.push(['removeDraft',i]),upload:()=>calls.push('upload'),selectPhotos:()=>calls.push('select')};
 const edit={draft:null,error:null,canManage:true,setDraft:value=>{edit.draft=value;},setConfirm:noop,cancel:()=>{edit.draft=null;},reload:()=>{edit.draft=null;r.reloadGallery();},start:()=>{edit.draft={...resource,price:'12000'};},save:async()=>true,withdraw:()=>calls.push('withdraw')};
 const {PhysicalgoodsManagement}=load('physicalgoods/components/PhysicalgoodsManagement.tsx',{react:h.react,'react/jsx-runtime':jsx,'react-native':native,'lucide-react-native':Object.fromEntries(['Archive','ArrowLeft','ChevronRight','Images','Package','Pencil','Tags'].map(v=>[v,v])),'@/components/Skeleton':{Skeleton:'Skeleton',SkeletonBlock:'Block'},'../../components/AgreementStepModal':{AgreementStepModal:'Modal'},'../../components/CatalogUI':{CATALOG_COLORS:{}},'../../components/PublicationFormUI':{PublicationSubmit:'Submit',PublicationUpload:'Upload'},'../../components/PublicationManagementUI':{ManagementAction:function ManagementAction(){},publicationManagementUI:{}},'../../components/RequestsUI':{RequestButton:'Action'},'../../components/SearchableFilterSelect':{SearchableFilterSelect:'Select'},'../hooks/useEditPhysicalgoods':{useEditPhysicalgoods:()=>edit},'../types/publication':{PHYSICALGOODS_MAX_IMAGES:3},'../utils/orderPhysicalgoodsCategories':load('physicalgoods/utils/orderPhysicalgoodsCategories.ts',{}),'./PhysicalgoodsEditor':{PhysicalgoodsEditor:'Editor'},'./PhysicalgoodsPriceHistory':{PhysicalgoodsOriginalPrice:'OriginalPrice'},'./PublicationImages':{PublicationImages:'Images'}});
 const render=()=>nodes(h.render(()=>PhysicalgoodsManagement({resources:r,onClose:()=>calls.push('close')})));
 return{r,edit,calls,render,choose:title=>render().find(n=>n.type?.name==='ManagementAction'&&n.props.title===title).props.onPress(),modal:()=>render().find(n=>n.type==='Modal'),back:()=>render().find(n=>n.props?.accessibilityLabel==='Volver a opciones de publicación').props.onPress()};
}
test('administration starts with four explicit options, never writes on navigation and closes without reloading the detail',()=>{
 const q=fixture();assert.deepEqual(q.render().filter(n=>n.type?.name==='ManagementAction').map(n=>n.props.title),['Editar datos','Gestionar fotos','Cambiar categoría','Retirar publicación']);assert.equal(q.modal().props.keyboardAvoiding,true);
 q.choose('Retirar publicación');assert.ok(!q.calls.includes('withdraw'));q.render().find(n=>n.props?.accessibilityLabel==='Confirmar retirada de publicación').props.onPress();assert.deepEqual(q.calls,['withdraw']);
 q.back();q.choose('Editar datos');assert.ok(q.render().some(n=>n.type==='Editor'));q.back();assert.equal(q.edit.draft,null);q.modal().props.onClose();assert.deepEqual(q.calls,['withdraw','close']);
});
test('save failure preserves the editor, only acknowledged success returns to options and busy prevents closing or navigating',async()=>{
 const q=fixture();q.choose('Editar datos');let resolve; q.edit.save=()=>{q.r.busy=true;return new Promise(done=>resolve=done);};
 q.render().find(n=>n.type==='Editor').props.onSave();assert.equal(q.modal().props.closeDisabled,true);q.modal().props.onClose();q.back();assert.ok(!q.calls.includes('close'));assert.ok(q.render().some(n=>n.type==='Editor'));
 q.r.busy=false;resolve(false);await setImmediate();assert.ok(q.render().some(n=>n.type==='Editor'));
 q.edit.save=async()=>true;q.render().find(n=>n.type==='Editor').props.onSave();await setImmediate();assert.equal(q.modal().props.title,'Administrar publicación');
});
test('photos use persisted IDs and real cover index, protect the last photo, and category writes remain explicit',()=>{
 const q=fixture();q.choose('Gestionar fotos');let strip=q.render().find(n=>n.type==='Images');assert.equal(strip.props.principalIndex,1);strip.props.onPrincipal(0);strip.props.onRemove(1);assert.deepEqual(q.calls,[['principal','photo-a'],['retire','photo-b']]);
 q.r.gallery.images=q.r.gallery.images.slice(0,1);strip=q.render().find(n=>n.type==='Images');assert.equal(strip.props.removeDisabled,true);strip.props.onRemove(0);assert.equal(q.calls.length,2);
 q.r.draftImages=[{uri:'new'}];q.render().find(n=>n.type==='Submit').props.onPress();assert.equal(q.calls.at(-1),'upload');
 q.back();q.choose('Cambiar categoría');q.render().find(n=>n.type==='Select').props.onChange('other');assert.equal(q.calls.length,3);q.render().find(n=>n.type==='Submit').props.onPress();assert.deepEqual(q.calls.at(-1),['category','other']);
});
test('permissions come from current resource, cached preview never enables writes and a refresh keeps the edit draft',()=>{
 const q=fixture();q.edit.canManage=false;assert.deepEqual(q.render().filter(n=>n.type?.name==='ManagementAction').map(n=>n.props.title),['Gestionar fotos','Cambiar categoría']);
 q.r.gallery.canEdit=false;assert.equal(q.render().filter(n=>n.type?.name==='ManagementAction').length,0);q.r.gallery.canEdit=true;q.edit.canManage=true;q.choose('Editar datos');q.r.gallery=null;q.r.galleryLoading=true;
 const form=q.render().find(n=>n.type==='Editor');assert.equal(form.props.disabled,true);assert.ok(form.props.edit.draft);q.render().find(n=>n.type==='Editor').props.onSave();assert.ok(!q.calls.length);
 q.r.galleryError='Sin conexión';q.r.galleryLoading=false;assert.ok(q.render().some(n=>n.props?.accessibilityRole==='alert'));q.render().find(n=>n.props?.label==='Recargar publicación').props.onPress();assert.equal(q.edit.draft,null);assert.deepEqual(q.calls,['reload']);
});
test('content hook retains original version and draft on failed write, converts donation price and only closes after successful withdrawal',async()=>{
 const h=runtime(),writes=[];let fail=true,closes=0;
 const r={selectedId:'resource',gallery:{id:'resource',owner:{id:'owner'},title:'Calculadora',description:'Con cubierta',condition:'BUEN_ESTADO',modality:'VENTA',price:1000,updatedAt:'original-version'},reloadGallery:noop,close:()=>closes++,change:async operation=>{try{await operation(new AbortController().signal);}catch{}}};
 const {useEditPhysicalgoods}=load('physicalgoods/hooks/useEditPhysicalgoods.ts',{react:h.react,'@/features/auth/hooks/useAuth':{useAuth:()=>({identity:{userId:'owner'}})},'../api/physicalgoodsApi':{updatePhysicalgoods:async(id,payload)=>{writes.push({id,payload});if(fail)throw Error('conflict');},withdrawPhysicalgoods:async()=>{if(fail)throw Error('network');}}});
 const render=()=>h.render(()=>useEditPhysicalgoods(r));render();render().start();let edit=render();edit.setDraft({...edit.draft,title:'Mi calculadora'});edit=render();r.gallery.updatedAt='new-server-version';assert.equal(await edit.save(),false);assert.equal(render().draft.title,'Mi calculadora');assert.equal(writes[0].payload.updatedAt,'original-version');
 edit=render();edit.setDraft({...edit.draft,modality:'DONACION',price:''});fail=false;assert.equal(await render().save(),true);assert.equal(writes.at(-1).payload.price,null);assert.equal(render().draft,null);
 fail=true;await render().withdraw();assert.equal(closes,0);fail=false;await render().withdraw();assert.equal(closes,1);
});
test('real management modal has independent panels, labelled inputs, compact photos and no destructive form on opening',()=>{
 const options={mode:'detail',variant:'own'};
 const overview=renderCatalog('physical',{...options,managementPanel:'overview'}).markup;
 for(const label of ['Administrar publicación','Editar datos','Gestionar fotos','Cambiar categoría','Retirar publicación'])assert.ok(overview.includes(label),label);
 assert.doesNotMatch(overview,/Confirmar retirada de publicación|Editar nombre del recurso/);
 const edit=renderCatalog('physical',{...options,managementPanel:'edit'}).markup;assert.match(edit,/Editar nombre del recurso/);assert.match(edit,/Guardar cambios/);assert.doesNotMatch(edit,/Recargar datos de edición|Guardar categoría/);
 const photos=renderCatalog('physical',{...options,managementPanel:'photos'}).markup;assert.match(photos,/Fotos publicadas/);assert.match(photos,/Guardar fotos nuevas/);assert.match(photos,/Usar imagen 2 como principal/);
 const retire=renderCatalog('physical',{...options,managementPanel:'withdraw'}).markup;assert.match(retire,/Confirmar retirada de publicación/);assert.match(retire,/Conservar publicación/);assert.doesNotMatch(retire,/Editar nombre del recurso/);
 const loading=renderCatalog('physical',{...options,managementPanel:'overview',managementRead:'loading'}).markup;assert.match(loading,/Cargando administración de publicación/);
});

function digitalFixture(){
 const h=runtime(),calls=[],l={detail:{id:'digital',title:'Guía',campusName:'San Andrés',status:'DISPONIBLE',isWithdrawn:false,modality:'VENTA',price:2500,files:[{id:'original-file',name:'guia.pdf',mimeType:'application/pdf',sizeBytes:1024}],careers:[],subjects:[]},isOwner:true,busy:false,downloading:null,editingAcademics:false,academicConflict:false,catalogLoading:false,catalogError:null,
  cancelAcademics:()=>{l.editingAcademics=false;},openAcademicEditor:async()=>{l.editingAcademics=true;},saveAcademics:async()=>false,download:file=>calls.push(['download',file.id]),openAttachments:()=>calls.push('attach'),savedContent:value=>{l.detail=value;calls.push('saved');}};
 const {DigitalPublicationManagement}=load('elibrary/components/DigitalPublicationManagement.tsx',{react:h.react,'react/jsx-runtime':jsx,'react-native':native,'lucide-react-native':Object.fromEntries(['Archive','ArrowLeft','BookOpen','FileText','Files','Pencil','Tags'].map(v=>[v,v])),
  '@/components/Skeleton':{Skeleton:'Skeleton',SkeletonBlock:'Block'},'../../components/AgreementStepModal':{AgreementStepModal:'Modal'},'../../components/CatalogUI':{CATALOG_COLORS:{}},'../../components/PublicationManagementUI':{ManagementAction:function ManagementAction(){},publicationManagementUI:{}},
  '../../components/PublicationFormUI':{PublicationFeedback:'Feedback',PublicationSection:'Section',PublicationSubmit:'Submit'},'../../components/RequestsUI':{RequestButton:'Action'},'./DigitalAcademicSelector':{DigitalAcademicSelector:'Academic'},'./DigitalPublicationEditor':{DigitalPublicationEditor:'Editor'}});
 const render=()=>nodes(h.render(()=>DigitalPublicationManagement({library:l,onClose:()=>calls.push('close')})));
 return{l,calls,render,choose:title=>render().find(n=>n.type?.name==='ManagementAction'&&n.props.title===title).props.onPress(),modal:()=>render().find(n=>n.type==='Modal'),back:()=>render().find(n=>n.props?.accessibilityLabel==='Volver a opciones de publicación').props.onPress()};
}
test('digital administration preserves separate writes, original file IDs and busy/owner navigation guards',async()=>{
 const q=digitalFixture();q.choose('Retirar publicación');assert.deepEqual(q.calls,[]);assert.equal(q.render().find(n=>n.type==='Editor').props.mode,'withdraw');q.back();
 q.choose('Gestionar archivos');q.render().find(n=>n.props?.accessibilityLabel==='Descargar guia.pdf').props.onPress();assert.deepEqual(q.calls,[['download','original-file']]);
 q.l.downloading='original-file';assert.equal(q.modal().props.closeDisabled,true);q.back();q.modal().props.onClose();assert.ok(!q.calls.includes('close'));
 q.l.downloading=null;q.render().find(n=>n.props?.label==='Seleccionar archivos nuevos').props.onPress();assert.equal(q.calls.at(-1),'attach');q.back();
 q.l.isOwner=false;assert.equal(q.render().filter(n=>n.type?.name==='ManagementAction').length,0);
});
test('academic loading locks closure and failed saves keep the selection panel until an acknowledged success',async()=>{
 const q=digitalFixture();let resolve;q.l.openAcademicEditor=()=>new Promise(done=>{resolve=()=>{q.l.editingAcademics=true;done();};});
 q.choose('Clasificación académica');assert.equal(q.modal().props.closeDisabled,true);q.back();assert.ok(q.render().some(n=>n.type==='Skeleton'));resolve();await setImmediate();
 let tree=q.render();assert.ok(tree.some(n=>n.type==='Academic'));await tree.find(n=>n.props?.label==='Guardar clasificación').props.onPress();await setImmediate();assert.ok(q.render().some(n=>n.type==='Academic'));
 q.l.academicConflict=true;assert.equal(q.render().find(n=>n.props?.label==='Guardar clasificación').props.disabled,true);q.l.academicConflict=false;q.l.saveAcademics=async()=>true;
 q.render().find(n=>n.props?.label==='Guardar clasificación').props.onPress();await setImmediate();assert.equal(q.modal().props.title,'Administrar publicación');assert.equal(q.render().find(n=>n.type==='Feedback').props.notice,'La clasificación académica se guardó.');
});
test('digital management renders the same controls with isolated editors, private files and safe conflict recovery',()=>{
 const options={mode:'detail',variant:'own'};
 const overview=renderCatalog('digital',{...options,managementPanel:'overview'}).markup;for(const label of ['Editar datos','Gestionar archivos','Clasificación académica','Retirar publicación'])assert.ok(overview.includes(label));assert.doesNotMatch(overview,/Editar título digital|Confirmar retirada digital/);
 const edit=renderCatalog('digital',{...options,managementPanel:'edit'}).markup;assert.match(edit,/Editar título digital/);assert.match(edit,/Guardar cambios/);assert.doesNotMatch(edit,/Confirmar retirada digital/);
 const retire=renderCatalog('digital',{...options,managementPanel:'withdraw'}).markup;assert.match(retire,/Confirmar retirada digital/);assert.match(retire,/mantendrán el acceso/);assert.doesNotMatch(retire,/Editar título digital/);
 const files=renderCatalog('digital',{...options,managementPanel:'files'}).markup;assert.match(files,/Descargar Guía de cálculo integral.pdf/);assert.match(files,/Seleccionar archivos nuevos/);
 const conflict=renderCatalog('digital',{...options,managementPanel:'edit',managementRead:'conflict'}).markup;assert.match(conflict,/Recargar publicación para editar/);assert.match(conflict,/descarta los cambios/);
});
