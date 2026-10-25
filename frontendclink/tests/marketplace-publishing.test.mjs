import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { renderCatalog } from './helpers/marketplace-render.mjs';
const noop=()=>{};
class AuthApiError extends Error {}
function load(file,deps){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(new URL('../src/features/marketplace/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
vm.runInNewContext(code,{module,exports:module.exports,AbortController,Error,TypeError,require:name=>{assert.ok(Object.hasOwn(deps,name),name);return deps[name];}});return module.exports;}
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
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const photos=[{name:'a.jpg',uri:'a',mimeType:'image/jpeg',base64:'a'},{name:'b.jpg',uri:'b',mimeType:'image/jpeg',base64:'b'}];
function physical(){const h=runtime(),choosing=deferred(),created=[],added=[];let fail=true;
 const {usePublishPhysicalgoods:hook}=load('physicalgoods/hooks/usePublishPhysicalgoods.ts',{react:h.react,'@/features/auth/hooks/useAuth':{useAuth:()=>({refreshIdentity:noop})},'@/lib/api/authenticated-request':{AuthApiError},'../types/publication':{PHYSICALGOODS_MAX_IMAGES:5},'../api/photoPicker':{pickPublicationPhotos:()=>choosing.promise},'../api/physicalgoodsApi':{
 loadPublicationOptions:async()=>({campus:{id:'campus',name:'Campus'},categories:[{id:'category',name:'Libros'}],careers:[],subjects:[]}),publishPhysicalgoods:async input=>{created.push(input);return{id:'saved',title:input.title};},addPhysicalgoodsPhoto:async(id,photo)=>{added.push(photo.name);if(fail){fail=false;throw new Error('network');}}}});
 return{h,choosing,created,added,render:()=>h.render(()=>hook(noop))};}
async function readyPhysical(q){q.render();await setImmediate();let state=q.render();state.setTitle('Calculadora');state.setDescription('Descripción');state.setCategoryId('category');state.setPrice('12000');state=q.render();return state;}
test('fotos: selección bloquea envío y edición; cambiar principal conserva fotos e ignora índices inválidos',async()=>{
 const q=physical();let state=await readyPhysical(q);const pending=state.choosePhoto();state=q.render();assert.equal(state.pickingPhoto,true);await state.publish();assert.equal(q.created.length,0);q.choosing.resolve(photos);await pending;state=q.render();state.makePrincipal(1);state=q.render();assert.equal(state.photo.name,'b.jpg');state.makePrincipal(99);state=q.render();assert.equal(state.photos.length,2);assert.equal(state.photo.name,'b.jpg');
});
test('fotos: fallo secundario reintenta solo pendientes sin recrear publicación ni perder principal',async()=>{
 const q=physical();let state=await readyPhysical(q);const pending=state.choosePhoto();q.choosing.resolve(photos);await pending;state=q.render();state.makePrincipal(1);state=q.render();await state.publish();state=q.render();assert.equal(q.created.length,1);assert.equal(q.created[0].photo.name,'b.jpg');assert.equal(state.remaining,1);assert.ok(state.error);await state.publish();state=q.render();assert.equal(q.created.length,1);assert.equal(state.remaining,0);assert.deepEqual(q.added,['a.jpg','a.jpg']);
});
function digital({refreshFailure=false}={}){const h=runtime(),created=[],added=[],released=[];let failAttach=!refreshFailure,failRead=refreshFailure;
 const files=[{name:'a.pdf',uri:'blob:a',sizeBytes:10},{name:'b.pdf',uri:'blob:b',sizeBytes:20}];
 const publication={id:'saved',title:'Guía',files:[{id:'a',name:'a.pdf'}]};
 const {useDigitalLibrary:hook}=load('elibrary/hooks/useDigitalLibrary.ts',{react:h.react,'@/features/auth/hooks/useAuth':{useAuth:()=>({refreshIdentity:noop})},'@/lib/api/authenticated-request':{AuthApiError},'../../api/resourceInteractions':{recordResourceOpening:noop},'../../hooks/useDebouncedValue':{useDebouncedValue:value=>value},'../api/saveDigitalFile':{},'../api/documentPicker':{pickDigitalFiles:async()=>refreshFailure?[files[0]]:files,mergeUniqueDigitalFiles:async(previous,chosen)=>({files:[...previous,...chosen],duplicates:[]}),releaseDigitalFile:file=>released.push(file.uri)},'../api/elibraryApi':{
 searchDigitalPublications:async()=>({data:[],meta:{hasMore:false}}),loadDigitalAcademicCatalog:async()=>({careers:[],subjects:[]}),publishDigitalPublication:async(input,file)=>{created.push({input,file});return publication;},attachDigitalFile:async(id,file)=>{added.push(file.name);if(failAttach){failAttach=false;throw new Error('network');}return{id:'b',name:file.name};},loadDigitalPublication:async()=>{if(failRead){failRead=false;throw new Error('refresh');}return publication;}}});
 return{h,created,added,released,render:()=>h.render(hook)};}
async function readyDigital(q){q.render();await setImmediate();let state=q.render();state.setTitle('Guía');state.setDescription('Descripción');state.setPrice('2500');state=q.render();await state.chooseFile();return q.render();}

test('publicación digital abre en venta, exige precio y vuelve a venta al reabrir o terminar',async()=>{
 const q=digital();let state=q.render();assert.equal(state.modality,'VENTA');await setImmediate();state=await readyDigital(q);
 state.setPrice('');state=q.render();await state.publish();assert.equal(q.created.length,0);assert.match(q.render().error,/precio de venta/);
 state=q.render();state.setModality('DONACION');state=q.render();assert.equal(state.price,'');state.closeForm();state=q.render();state.openForm();state=q.render();assert.equal(state.modality,'VENTA');
 await setImmediate();state=q.render();state.setModality('DONACION');state=q.render();await state.publish();state=q.render();assert.equal(q.created[0].input.modality,'DONACION');assert.equal(q.created[0].input.price,null);
 await state.publish();state=q.render();assert.equal(state.target,null);assert.equal(state.modality,'VENTA');q.h.unmount();
});

test('clasificación digital mantiene buscadores montados y editables durante carga y reintento',()=>{
 const h=runtime();
 const {DigitalAcademicSelector}=load('elibrary/components/DigitalAcademicSelector.tsx',{react:h.react,'react/jsx-runtime':jsx,'react-native':{Text:'Text',View:'View'},'../../components/SearchableMultiSelect':{SearchableMultiSelect:'Select'},'../../components/RequestsUI':{RequestButton:'Button'},'../../components/CatalogUI':{ui:{}}});
 const props={catalog:null,loading:true,error:null,reload:noop,careerIds:[],subjectIds:[],onCareersChange:noop,onSubjectsChange:noop,disabled:false};
 const nodes=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(4).flatMap(nodes)];
 const fields=()=>nodes(h.render(()=>DigitalAcademicSelector(props))).filter(row=>row.type==='Select');
 let selects=fields();assert.equal(selects.length,2);assert.ok(selects.every(row=>row.props.loading&&!row.props.disabled));
 selects[0].props.onExpandedChange(true);selects=fields();assert.equal(selects[0].props.expanded,true);
 props.loading=false;props.catalog={careers:[{id:'inf',name:'Informática'}],subjects:[]};selects=fields();assert.equal(selects[0].props.expanded,true);assert.equal(selects[0].props.options[0].id,'inf');
 props.catalog=null;props.error='Sin conexión';selects=fields();assert.equal(selects.length,2);assert.ok(selects.every(row=>!row.props.disabled));h.unmount();
});

test('formulario digital muestra nuevo título y campos académicos antes de recibir opciones',()=>{
 const initial=renderCatalog('digital',{mode:'publish',state:'loading'}).markup;
 assert.match(initial,/Publicar recurso digital/);assert.match(initial,/aria-label="Buscar carreras para filtrar"/);assert.match(initial,/aria-label="Buscar asignaturas para filtrar"/);
 assert.doesNotMatch(initial,/Cargando catálogo académico|Cargando opciones…|Sin opciones disponibles/);
 const failed=renderCatalog('digital',{mode:'publish',state:'error-options'}).markup;assert.match(failed,/Buscar carreras para filtrar/);assert.match(failed,/Reintentar catálogo/);
});
test('PDF: fallo adicional conserva pendientes y reintenta sin publicar otro recurso',async()=>{
 const q=digital();let state=await readyDigital(q);await state.publish();state=q.render();assert.equal(state.target.id,'saved');assert.equal(state.files.length,1);assert.equal(state.files[0].name,'b.pdf');assert.match(state.notice,/guardada/);assert.equal(q.created.length,1);await state.publish();state=q.render();assert.equal(state.formOpen,false);assert.equal(state.files.length,0);assert.equal(q.created.length,1);assert.deepEqual(q.added,['b.pdf','b.pdf']);assert.deepEqual(q.released,['blob:a','blob:b']);
});
test('PDF: si falla recarga después del upload, reintentar consulta sin exigir ni reenviar archivos',async()=>{
 const q=digital({refreshFailure:true});let state=await readyDigital(q);await state.publish();state=q.render();assert.equal(state.target.id,'saved');assert.equal(state.files.length,0);assert.ok(state.error);await state.publish();state=q.render();assert.equal(state.error,null);assert.equal(state.target,null);assert.equal(q.created.length,1);assert.equal(q.added.length,0);
});
for(const screen of ['physical','digital'])test(`${screen}: donación oculta precio y venta lo muestra`,()=>{
 const sale=renderCatalog(screen,{mode:'publish'}).markup,donation=renderCatalog(screen,{mode:'publish',variant:'donation'}).markup;
 assert.match(sale,/Precio.*CLP/);assert.doesNotMatch(donation,/aria-label="Precio/);assert.match(donation,/aria-checked="true"[^>]*|Donación/);
});
test('formularios: archivos requeridos y reintento de carga parcial mantienen acciones correctas',()=>{
 const digital=renderCatalog('digital',{mode:'publish',variant:'partial'}).markup;assert.match(digital,/Adjuntar archivos pendientes/);assert.match(digital,/Continuar con los archivos guardados/);assert.match(digital,/La publicación está guardada/);
 const physical=renderCatalog('physical',{mode:'publish',variant:'partial'}).markup;assert.match(physical,/Reintentar imágenes pendientes/);assert.match(physical,/Recurso publicado/);
 const empty=renderCatalog('digital',{mode:'publish',variant:'empty'}).markup;assert.match(empty,/aria-disabled="true"/);assert.match(empty,/al menos un PDF/);
});

test('dropzone web: consume archivos solo habilitada y evita navegación del navegador',()=>{
 const h=runtime(),drops=[],file={name:'guia.pdf'};let prevented=0;
 const {DigitalFileDropzone}=load('elibrary/components/DigitalFileDropzone.web.tsx',{react:h.react,'react/jsx-runtime':jsx,'../../components/PublicationFormUI':{PublicationUpload:noop}});
 const render=disabled=>h.render(()=>DigitalFileDropzone({disabled,busy:false,onChoose:noop,onDropFiles:files=>drops.push(files)}));
 const event={preventDefault:()=>prevented++,dataTransfer:{files:[file]}};
 render(false).props.onDrop(event);assert.equal(drops.length,1);assert.equal(drops[0][0],file);
 render(true).props.onDrop(event);assert.equal(drops.length,1);assert.equal(prevented,2);
});
