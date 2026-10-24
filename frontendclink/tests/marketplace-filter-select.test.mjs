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
  'lucide-react-native':{Check:'Check',ChevronDown:'Down',ChevronUp:'Up',Search:'Search'},'../hooks/useDebouncedValue':{useDebouncedValue},'./CatalogUI':{CATALOG_COLORS:{},ui:{}}});
 const props={label:'Carrera',options,value,expanded:false,onChange:id=>changes.push(id),onExpandedChange:open=>{props.expanded=open;expansions.push(open);}};
 const root=()=>SearchableFilterSelect(props);
 const render=()=>h.render(()=>{const menu=elements(root()).find(node=>typeof node.type==='function');return menu?menu.type(menu.props):null;});
 return {h,props,root,render,changes,expansions,get dismissed(){return dismissed;}};
}
const options=[{id:'inf',name:'Ingeniería en Informática',code:'INF-01'},{id:'adm',name:'Administración',code:'ADM-02'},{id:'art',name:'Diseño',code:null}];
const radios=tree=>elements(tree).filter(node=>node.props?.accessibilityRole==='radio');
const input=tree=>elements(tree).find(node=>node.type==='Input');

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

test('catálogo extenso conserva IDs homónimos/selección, pagina opciones y reinicia límite al buscar',()=>{
 const rows=Array.from({length:55},(_,i)=>({id:String(i),name:'Carrera '+i,code:'COD-'+i}));rows[2].name=rows[3].name='Nombre compartido';
 const f=fixture(rows,'54');f.props.expanded=true;let tree=f.render();assert.equal(radios(tree).length,21);assert.equal(radios(tree)[1].props.accessibilityState.checked,true);
 elements(tree).find(node=>node.props?.accessibilityLabel==='Mostrar más opciones de carrera').props.onPress();tree=f.render();assert.equal(radios(tree).length,41);
 input(tree).props.onChangeText('nombre compartido');tree=f.render();f.h.tick(300);tree=f.render();assert.equal(radios(tree).length,3);assert.notEqual(radios(tree)[1].key,radios(tree)[2].key);
 radios(tree)[2].props.onPress();assert.deepEqual(f.changes,['3']);f.h.unmount();
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


test('filtro académico exige texto, espera300ms y al borrar oculta de inmediato sin perder selección',()=>{
 const f=fixture(options,'inf');f.props.searchRequired=true;f.props.expanded=true;let tree=f.render();
 assert.equal(radios(tree).length,0);assert.match(JSON.stringify(tree),/Escribe el nombre o código/);assert.doesNotMatch(JSON.stringify(tree),/Cualquiera|Ingeniería en Informática/);
 input(tree).props.onChangeText('   ');tree=f.render();f.h.tick(300);tree=f.render();assert.equal(radios(tree).length,0);
 input(tree).props.onChangeText('admin');tree=f.render();f.h.tick(299);tree=f.render();assert.equal(radios(tree).length,0);f.h.tick(1);tree=f.render();assert.equal(radios(tree).length,2);assert.match(JSON.stringify(tree),/Administración/);assert.deepEqual(f.changes,[]);
 input(tree).props.onChangeText('');tree=f.render();assert.equal(radios(tree).length,0);assert.doesNotMatch(JSON.stringify(tree),/Administración|Buscando opciones/);f.h.tick(300);tree=f.render();assert.equal(radios(tree).length,0);assert.equal(f.props.value,'inf');
 elements(tree).find(node=>node.props?.accessibilityLabel==='Quitar filtro de carrera').props.onPress();assert.deepEqual(f.changes,['']);assert.equal(f.props.expanded,false);f.h.unmount();
});

test('placeholder académico conserva etiqueta accesible cuando la etiqueta visual se agrupa', () => {
 const f=fixture(options);f.props.showLabel=false;f.props.placeholder='Carrera';
 let root=f.root();let trigger=elements(root).find(node=>node.type==='Button');
 assert.equal(trigger.props.accessibilityLabel,'Seleccionar carrera');assert.equal(trigger.props.accessibilityValue.text,'Carrera');
 assert.equal(elements(root).filter(node=>node.type==='Text'&&node.props.children==='Carrera').length,1);
 f.props.value='inf';root=f.root();trigger=elements(root).find(node=>node.type==='Button');
 assert.equal(trigger.props.accessibilityValue.text,'Ingeniería en Informática');f.h.unmount();
});
