import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

const elements=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(4).flatMap(elements)];
function runtime(){
 const slots=[],timers=new Map();let cursor=0,effects=[],clock=0,next=0;
 const react={
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,value=>slots[i].value=typeof value==='function'?value(slots[i].value):value];},
  useMemo(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))slots[i]={value:fn(),deps};return slots[i].value;},
  useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()};});},
 };
 return {react,timers,globals:{setTimeout(fn,delay){const id=++next;timers.set(id,{fn,at:clock+delay});return id;},clearTimeout(id){timers.delete(id);}},
  render(fn){cursor=0;effects=[];const tree=fn();effects.forEach(effect=>effect());return tree;},
  tick(ms){clock+=ms;for(const[id,timer]of[...timers])if(timer.at<=clock){timers.delete(id);timer.fn();}},
  unmount(){slots.forEach(slot=>slot?.cleanup?.());},
 };
}
function load(file,deps,globals={}){
 const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(new URL('../src/features/marketplace/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,...globals,require(name){assert.ok(Object.hasOwn(deps,name),name);return deps[name];}});return module.exports;
}
function fixture(options,value=''){
 const h=runtime(),changes=[],expansions=[];let dismissed=0;
 const {useDebouncedValue}=load('hooks/useDebouncedValue.ts',{react:h.react},h.globals);
 const {SearchableFilterSelect}=load('components/SearchableFilterSelect.tsx',{react:h.react,'react/jsx-runtime':jsx,
  'react-native':{View:'View',Text:'Text',TextInput:'Input',Pressable:'Button',ScrollView:'Scroll',ActivityIndicator:'Spinner',Keyboard:{dismiss:()=>dismissed++},StyleSheet:{create:v=>v}},
  'lucide-react-native':{Check:'Check',ChevronDown:'Down',ChevronUp:'Up',Search:'Search',X:'X'},'../hooks/useDebouncedValue':{useDebouncedValue},'./CatalogUI':{CATALOG_COLORS:{},ui:{}}},h.globals);
 const props={label:'Carrera',options,value,expanded:false,onChange:id=>changes.push(id),onExpandedChange:open=>{props.expanded=open;expansions.push(open);}};
 const root=()=>SearchableFilterSelect(props);
 const resolve=node=>Array.isArray(node)?node.map(resolve):!node||typeof node!=='object'?node:typeof node.type==='function'?resolve(node.type(node.props)):{...node,props:{...node.props,children:resolve(node.props?.children)}};
 const render=()=>h.render(()=>{if(props.searchRequired)return resolve(root());const menu=elements(root()).find(node=>typeof node.type==='function');return menu?menu.type(menu.props):null;});
 return {h,props,root,render,changes,expansions,get dismissed(){return dismissed;}};
}
const options=[{id:'inf',name:'Ingeniería en Informática',code:'INF-01'},{id:'adm',name:'Administración',code:'ADM-02'},{id:'art',name:'Diseño',code:null}];
const radios=tree=>elements(tree).filter(node=>node.props?.accessibilityRole==='radio');
const input=tree=>elements(tree).find(node=>node.type==='Input');

test('campos obligatorios no permiten limpiar y los opcionales usan una opción vacía propia del formulario',()=>{
 const f=fixture(options,'art');f.props.expanded=true;f.props.allowEmpty=false;f.props.searchable=false;
 let tree=f.render();assert.equal(input(tree),undefined);assert.equal(radios(tree).length,options.length);assert.ok(radios(tree).every(row=>row.key!==''));
 assert.equal(radios(tree).at(-1).key,'art');assert.equal(radios(tree).at(-1).props.accessibilityState.checked,true);
 f.props.allowEmpty=true;f.props.emptyLabel='Sin carrera';f.props.clearLabel='Quitar selección';tree=f.render();
 assert.equal(radios(tree)[0].props.accessibilityLabel,'Carrera: Sin carrera');radios(tree)[0].props.onPress();
 assert.deepEqual(f.changes,['']);assert.equal(f.props.expanded,false);f.h.unmount();
});

test('desplegable cerrado muestra selección, abre bajo demanda y elegir el mismo ID no consulta de nuevo',()=>{
 const f=fixture(options,'inf');let root=f.root();assert.equal(elements(root).some(node=>node.type==='Input'),false);
 const trigger=elements(root).find(node=>node.type==='Button');assert.equal(trigger.props.accessibilityValue.text,'Ingeniería en Informática');assert.equal(trigger.props.accessibilityState.expanded,false);
 trigger.props.onPress();const tree=f.render();assert.equal(radios(tree).length,4);assert.equal(radios(tree).filter(node=>node.props.accessibilityState.checked).length,1);
 radios(tree).find(node=>node.props.accessibilityState.checked).props.onPress();assert.deepEqual(f.changes,[]);assert.equal(f.props.expanded,false);assert.equal(f.dismissed,1);f.h.unmount();
});

test('escritura rápida espera300ms, oculta opciones obsoletas y busca sin tildes o por código sin cambiar filtro',()=>{
 const f=fixture(options);f.props.expanded=true;let tree=f.render();input(tree).props.onChangeText('admin');tree=f.render();assert.equal(radios(tree).length,0);assert.match(JSON.stringify(tree),/Buscando opciones/);
 f.h.tick(200);input(tree).props.onChangeText('ingenieria');tree=f.render();f.h.tick(299);tree=f.render();assert.equal(radios(tree).length,0);assert.deepEqual(f.changes,[]);
 f.h.tick(1);tree=f.render();assert.equal(radios(tree).length,2);assert.match(JSON.stringify(tree),/Ingeniería en Informática/);assert.doesNotMatch(JSON.stringify(tree),/Administración/);
 input(tree).props.onChangeText('ADM-02');tree=f.render();f.h.tick(300);tree=f.render();assert.equal(radios(tree).length,2);radios(tree)[1].props.onPress();assert.deepEqual(f.changes,['adm']);assert.equal(f.props.expanded,false);f.h.unmount();
});

test('catálogo extenso permite todas las opciones con scroll, sin Mostrar más, conservando IDs homónimos/selección',()=>{
 const rows=Array.from({length:55},(_,i)=>({id:String(i),name:'Carrera '+i,code:'COD-'+i}));rows[2].name=rows[3].name='Nombre compartido';
 const f=fixture(rows,'54');f.props.expanded=true;let tree=f.render();assert.equal(radios(tree).length,56);assert.equal(radios(tree)[1].props.accessibilityState.checked,true);
 assert.doesNotMatch(JSON.stringify(tree),/Mostrar más|Ver más/);assert.equal(f.props.expanded,true);
 input(tree).props.onChangeText('nombre compartido');tree=f.render();f.h.tick(300);tree=f.render();assert.equal(radios(tree).length,3);assert.notEqual(radios(tree)[1].key,radios(tree)[2].key);
 radios(tree)[2].props.onPress();assert.deepEqual(f.changes,['3']);f.h.unmount();
});

test('búsqueda académica con55 coincidencias permite seleccionar la última sin acción intermedia',()=>{
 const rows=Array.from({length:55},(_,i)=>({id:String(i),name:'Carrera '+i}));
 const f=fixture(rows);f.props.searchRequired=true;let tree=f.render();input(tree).props.onFocus();tree=f.render();
 input(tree).props.onChangeText('Carrera');f.render();f.h.tick(300);tree=f.render();
 assert.equal(radios(tree).length,55);assert.doesNotMatch(JSON.stringify(tree),/Mostrar más|Ver más/);
 assert.equal(f.props.expanded,true);assert.deepEqual(f.changes,[]);
 radios(tree).find(row=>row.key==='54').props.onPress();assert.deepEqual(f.changes,['54']);assert.equal(f.props.expanded,false);f.h.unmount();
});

test('sin coincidencias permite limpiar selección y desmontar cancela debounce pendiente',()=>{
 const f=fixture(options,'inf');f.props.expanded=true;let tree=f.render();input(tree).props.onChangeText('xyz');f.render();f.h.tick(300);tree=f.render();assert.match(JSON.stringify(tree),/No hay coincidencias/);assert.equal(radios(tree).length,1);
 radios(tree)[0].props.onPress();assert.deepEqual(f.changes,['']);assert.equal(f.props.expanded,false);
 f.props.expanded=true;tree=f.render();input(tree).props.onChangeText('otra');f.render();assert.equal(f.h.timers.size,1);f.h.unmount();assert.equal(f.h.timers.size,0);f.h.tick(1000);assert.deepEqual(f.changes,['']);
});

test('catálogo en carga/deshabilitado no abre menú; vacío y selección no disponible son recuperables',()=>{
 const f=fixture([],'missing');f.props.expanded=true;f.props.loading=true;let trigger=elements(f.root()).find(node=>node.type==='Button');assert.equal(trigger.props.disabled,true);assert.equal(trigger.props.accessibilityState.expanded,false);assert.equal(f.render(),null);
 f.props.loading=false;f.props.disabled=true;assert.equal(f.render(),null);f.props.disabled=false;trigger=elements(f.root()).find(node=>node.type==='Button');assert.equal(trigger.props.accessibilityValue.text,'Selección no disponible');const tree=f.render();assert.match(JSON.stringify(tree),/Sin opciones disponibles/);radios(tree)[0].props.onPress();assert.deepEqual(f.changes,['']);f.h.unmount();
});


test('campo académico permite escribir ahí mismo, espera300ms y al borrar conserva selección',()=>{
 const f=fixture(options,'inf');f.props.searchRequired=true;let tree=f.render();
 assert.equal(input(tree).props.value,'Ingeniería en Informática');assert.equal(elements(tree).filter(node=>node.type==='Input').length,1);
 assert.equal(elements(tree).filter(node=>node.type==='Button').length,1); // solo limpiar; ningún trigger desplegable
 input(tree).props.onFocus();tree=f.render();assert.equal(input(tree).props.value,'');
 assert.equal(radios(tree).length,0);assert.doesNotMatch(JSON.stringify(tree),/Escribe el nombre o código|Buscar por nombre o código/);
 input(tree).props.onChangeText('   ');tree=f.render();f.h.tick(300);tree=f.render();assert.equal(radios(tree).length,0);
 input(tree).props.onChangeText('admin');tree=f.render();f.h.tick(299);tree=f.render();assert.equal(radios(tree).length,0);f.h.tick(1);tree=f.render();assert.equal(radios(tree).length,1);assert.match(JSON.stringify(tree),/Administración/);assert.deepEqual(f.changes,[]);
 input(tree).props.onChangeText('');tree=f.render();assert.equal(radios(tree).length,0);assert.doesNotMatch(JSON.stringify(tree),/Administración|Buscando opciones/);f.h.tick(300);tree=f.render();assert.equal(radios(tree).length,0);assert.equal(f.props.value,'inf');
 elements(tree).find(node=>node.props?.accessibilityLabel==='Quitar filtro de carrera').props.onPress();assert.deepEqual(f.changes,['']);assert.equal(f.props.expanded,false);f.h.unmount();
});

test('selección en línea respeta IDs y permite tocar una sugerencia después del blur sin perder el toque',()=>{
 const f=fixture(options,'inf');f.props.searchRequired=true;let tree=f.render();input(tree).props.onFocus();tree=f.render();
 input(tree).props.onChangeText('ADM-02');f.render();f.h.tick(300);tree=f.render();
 input(tree).props.onBlur();tree=f.render();f.h.tick(100);assert.equal(f.props.expanded,true);
 radios(tree)[0].props.onPress();tree=f.render();assert.deepEqual(f.changes,['adm']);assert.equal(f.props.expanded,false);assert.equal(f.dismissed,1);
 f.h.tick(300);assert.equal(f.expansions.filter(open=>open===false).length,1);f.h.unmount();
});

test('abandonar el campo cierra sugerencias; recuperar foco cancela cierre, Escape conserva selección',()=>{
 const f=fixture(options,'inf');f.props.searchRequired=true;let tree=f.render();input(tree).props.onFocus();tree=f.render();
 input(tree).props.onChangeText('ingenieria');f.render();f.h.tick(300);tree=f.render();assert.equal(radios(tree).length,1);
 input(tree).props.onBlur();tree=f.render();f.h.tick(100);input(tree).props.onFocus();tree=f.render();f.h.tick(100);assert.equal(f.props.expanded,true);
 input(tree).props.onKeyPress({nativeEvent:{key:'Escape'}});tree=f.render();assert.equal(f.props.expanded,false);assert.equal(input(tree).props.value,'Ingeniería en Informática');assert.deepEqual(f.changes,[]);
 input(tree).props.onFocus();tree=f.render();input(tree).props.onBlur();f.render();f.h.tick(150);assert.equal(f.props.expanded,false);f.h.unmount();
});

test('campo académico bloqueado no es editable; al desmontar cancela búsqueda pendiente',()=>{
 const f=fixture(options);f.props.searchRequired=true;f.props.disabled=true;let tree=f.render();assert.equal(input(tree).props.editable,false);assert.equal(radios(tree).length,0);
 f.props.disabled=false;tree=f.render();input(tree).props.onFocus();tree=f.render();input(tree).props.onChangeText('admin');f.render();assert.ok(f.h.timers.size>0);f.h.unmount();assert.equal(f.h.timers.size,0);
});

test('carga de opciones permite escribir y conserva consulta al llegar el catálogo, sin resultados vacíos transitorios',()=>{
 const f=fixture([]);f.props.searchRequired=true;f.props.optionsLoading=true;let tree=f.render();assert.equal(input(tree).props.editable,true);
 input(tree).props.onFocus();tree=f.render();assert.doesNotMatch(JSON.stringify(tree),/Buscando opciones|Sin opciones/);
 input(tree).props.onChangeText('informatica');f.render();f.h.tick(300);tree=f.render();assert.match(JSON.stringify(tree),/Buscando opciones/);assert.doesNotMatch(JSON.stringify(tree),/Sin opciones disponibles/);
 f.props.options=options;f.props.optionsLoading=false;tree=f.render();assert.equal(input(tree).props.value,'informatica');assert.equal(radios(tree).length,1);
 radios(tree)[0].props.onPress();assert.deepEqual(f.changes,['inf']);f.h.unmount();
});

test('placeholder académico conserva etiqueta accesible cuando la etiqueta visual se agrupa', () => {
 const f=fixture(options);f.props.showLabel=false;f.props.placeholder='Carrera';
 let root=f.root();let trigger=elements(root).find(node=>node.type==='Button');
 assert.equal(trigger.props.accessibilityLabel,'Seleccionar carrera');assert.equal(trigger.props.accessibilityValue.text,'Carrera');
 assert.equal(elements(root).filter(node=>node.type==='Text'&&node.props.children==='Carrera').length,1);
 f.props.value='inf';root=f.root();trigger=elements(root).find(node=>node.type==='Button');
 assert.equal(trigger.props.accessibilityValue.text,'Ingeniería en Informática');f.h.unmount();
});
