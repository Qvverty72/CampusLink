import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
const noop=()=>{};
const elements=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(6).flatMap(elements)];
function load(file,deps,globals={},extra=''){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(new URL('../src/features/marketplace/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
vm.runInNewContext(code+extra,{module,exports:module.exports,...globals,require:name=>{assert.ok(Object.hasOwn(deps,name),name);return deps[name];}});return module.exports;}
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

test('polling20s conserva callback vigente, pausa background/formulario y limpia timer al desmontar',()=>{
 const h=runtime(),timers=new Map(),listeners=new Set();let interval=0,calls=0,enabled=false,callback=()=>calls++;
 const AppState={currentState:'active',addEventListener(event,fn){listeners.add(fn);return{remove:()=>listeners.delete(fn)};}};
 const {useAgreementPolling}=load('hooks/useAgreementPolling.ts',{react:h.react,'react-native':{AppState}},{setInterval:(fn,delay)=>{assert.equal(delay,20000);timers.set(++interval,fn);return interval;},clearInterval:id=>timers.delete(id)});
 const render=()=>h.render(()=>useAgreementPolling(callback,enabled));render();assert.equal(timers.size,0);enabled=true;render();assert.equal(timers.size,1);timers.values().next().value();assert.equal(calls,1);
 callback=()=>calls+=10;render();assert.equal(interval,1);for(const fn of listeners)fn('background');timers.values().next().value();assert.equal(calls,1);for(const fn of listeners)fn('active');timers.values().next().value();assert.equal(calls,11);
 enabled=false;render();assert.equal(timers.size,0);assert.equal(listeners.size,0);enabled=true;render();h.unmount();assert.equal(timers.size,0);assert.equal(listeners.size,0);
});
test('polling configurable de mensajes usa 7s y aborta lecturas al pausar o cerrar sin cambiar el intervalo general',()=>{
 const h=runtime(),timers=new Map(),listeners=new Set();let enabled=true,calls=0,pauses=0;
 const {useAgreementPolling,COORDINATION_MESSAGES_POLL_INTERVAL,AGREEMENT_POLL_INTERVAL}=load('hooks/useAgreementPolling.ts',{react:h.react,'react-native':{AppState:{currentState:'active',addEventListener:(_,fn)=>{listeners.add(fn);return{remove:()=>listeners.delete(fn)};}}}},{setInterval:(fn,delay)=>{assert.equal(delay,7000);timers.set(1,fn);return 1;},clearInterval:id=>timers.delete(id)});
 assert.equal(COORDINATION_MESSAGES_POLL_INTERVAL,7000);assert.equal(AGREEMENT_POLL_INTERVAL,20000);
 const render=()=>h.render(()=>useAgreementPolling(()=>calls++,enabled,COORDINATION_MESSAGES_POLL_INTERVAL,()=>pauses++));render();timers.get(1)();assert.equal(calls,1);
 for(const listener of listeners)listener('background');assert.equal(pauses,1);timers.get(1)();assert.equal(calls,1);
 for(const listener of listeners)listener('active');timers.get(1)();assert.equal(calls,2);
 enabled=false;render();assert.equal(pauses,2);assert.equal(timers.size,0);assert.equal(listeners.size,0);h.unmount();
});
test('registro marketplace usa callback estable y respeta pestaña oculta sin perder la última consulta',()=>{
 const h=runtime(),calls=[];let value=0,fn=()=>value++;
 const {useMarketplaceRefresh}=load('hooks/useMarketplaceRefresh.ts',{react:h.react,'@/components/RefreshScrollView':{useScrollRefresh:(...args)=>calls.push(args)}});
 h.render(()=>useMarketplaceRefresh(fn,false,true,'lista',true));const registered=calls[0][0];fn=()=>value+=10;h.render(()=>useMarketplaceRefresh(fn,false,false,'lista',false));assert.equal(calls[1][0],registered);assert.equal(calls[1][4],false);registered();assert.equal(value,10);
});
test('biblioteca personal mantiene pestañas montadas pero activa solo una para refresco y polling',()=>{
 const h=runtime();const {DigitalPersonalLibrary}=load('elibrary/components/DigitalPersonalLibrary.tsx',{react:h.react,'react/jsx-runtime':jsx,'react-native':{View:'View',ScrollView:'Scroll'},'../../components/CatalogUI':{CatalogTabs:'Tabs'},'../hooks/useDigitalActivity':{useDigitalActivityCounts:()=>({counts:null,loading:false,reload:noop})},'./DigitalAcquiredActivity':{DigitalAcquiredActivity:'Acquired'},'./DigitalPublications':{DigitalPublications:'Owned'},'./DigitalActivityRequests':{DigitalActivityRequests:'Requests'},'./DigitalActivityTransactions':{DigitalActivityTransactions:'Trades'}});
 const render=()=>elements(h.render(()=>DigitalPersonalLibrary()));let tree=render();tree.find(node=>node.type==='Tabs').props.onSelect('owned');tree=render();tree.find(node=>node.type==='Tabs').props.onSelect('transactions');tree=render();assert.equal(tree.find(node=>node.type==='Acquired').props.active,false);assert.equal(tree.find(node=>node.type==='Owned').props.active,false);assert.equal(tree.find(node=>node.type==='Trades').props.active,true);
 tree.find(node=>node.type==='Tabs').props.onSelect('acquired');tree=render();assert.equal(tree.find(node=>node.type==='Trades').props.active,false);
});
test('acuerdos digitales bloquean gesto/poll en formulario, decisión y pestaña oculta; terminal deja de consultar',()=>{
 const h=runtime(),registered=[],polling=[];const state={open:true,loading:false,busy:false,selection:null,action:null,tradeTarget:{publicationId:'p',transactionId:'t'},trade:{id:'t',status:'RESERVADA',canRate:false},refresh:noop,poll:noop};
 const {DigitalTradeCenter}=load('elibrary/components/DigitalTradeCenter.tsx',{react:h.react,'react/jsx-runtime':jsx,'react-native':{View:'View',Text:'Text',Pressable:'Button',StyleSheet:{create:value=>value}},'@/types/colors':{APP_COLORS:{}},'../hooks/useDigitalTrades':{useDigitalTradeCenter:()=>state},'./DigitalRequests':{DigitalRequests:'Requests'},'./DigitalTransactionDetail':{DigitalTransactionDetail:'Trade'},'../../components/MarketplaceReportForm':{MarketplaceReportForm:'Report'},'../../hooks/useMarketplaceRefresh':{useMarketplaceRefresh:(...args)=>registered.push(args)},'../../hooks/useAgreementPolling':{useAgreementPolling:(...args)=>polling.push(args)}});
 const render=(active=true)=>elements(h.render(()=>DigitalTradeCenter({embedded:true,active})));let tree=render();assert.equal(registered.at(-1)[2],true);assert.equal(polling.at(-1)[1],true);
 render(false);assert.equal(registered.at(-1)[4],false);assert.equal(polling.at(-1)[1],false);state.action='confirm';render();assert.equal(registered.at(-1)[2],false);assert.equal(polling.at(-1)[1],false);state.action=null;
 state.trade.status='COMPLETADA';state.trade.canRate=true;render();assert.equal(registered.at(-1)[2],false);assert.equal(polling.at(-1)[1],false);state.trade.canRate=false;render();assert.equal(registered.at(-1)[2],true);assert.equal(polling.at(-1)[1],false);
 state.trade.status='RESERVADA';tree=render();tree.find(node=>node.type==='Trade').props.onReport();tree=render();assert.ok(tree.some(node=>node.type==='Report'));assert.equal(registered.at(-1)[2],false);assert.equal(polling.at(-1)[1],false);
});

test('Mercado usa página de catálogo para pull y desactiva gesto al entrar a publicar o actividad',()=>{
 const h=runtime(),refresh=noop,resources={refresh,loading:false,busy:false,selectedId:null};
 const counters={counts:{sentAccepted:1,receivedPending:3,pendingRequests:2,pendingTransactions:4},loading:false,reload:noop},counterReads=[];
 const deps={react:h.react,'react/jsx-runtime':jsx,'react-native':{View:'View',Text:'Text',Pressable:'Button',StyleSheet:{create:value=>value}},'expo-router':{},'@/components/RefreshScrollView':{RefreshScrollView:'Refresh'},'@/components/navigation/BottomNavigationBar':{},'@/features/auth/hooks/useAuth':{},'../hooks/usePublishPhysicalgoods':{},'../hooks/usePhysicalgoodsResources':{usePhysicalgoodsResources:()=>resources},'../types/publication':{},'../../utils/agreementPresentation':{agreementCopy:{tabTitle:'Transacciones'}},'../../components/CatalogUI':{CatalogTabs:'Tabs',PublishFAB:'Fab',ScreenHeader:'Header'},'../../components/PublicationFormUI':{},'../../components/PublicationChoices':{},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:59,bottom:34})}};
 deps['../../components/SearchableFilterSelect']={SearchableFilterSelect:'Select'};
 deps['../utils/orderPhysicalgoodsCategories']=load('physicalgoods/utils/orderPhysicalgoodsCategories.ts',{});
 for(const name of ['PhysicalgoodsResources','PublicationImages','PhysicalgoodsRequests','PhysicalgoodsTransaction','PhysicalgoodsHistory'])deps['./'+name]={[name]:name};
 deps['../hooks/usePhysicalgoodsRequestCounts']={usePhysicalgoodsRequestCounts:(active,version)=>{counterReads.push({active,version});return counters;}};
 const {Content}=load('physicalgoods/components/PublishPhysicalgoods.tsx',deps,{},'\nmodule.exports.Content=PhysicalgoodsContent;');const render=()=>elements(h.render(()=>Content({})));let tree=render();assert.equal(tree.find(node=>node.type==='Refresh').props.onRefresh,refresh);assert.equal(tree.find(node=>node.type==='Refresh').props.refreshIndicatorOffset,67);assert.equal(tree.find(node=>node.type==='Refresh').props.refreshEnabled,true);
 tree.find(node=>node.type==='Fab').props.onPress();tree=render();assert.equal(tree.find(node=>node.type==='Refresh').props.onRefresh,undefined);assert.equal(tree.find(node=>node.type==='Refresh').props.refreshEnabled,false);
 tree.find(node=>node.type==='Header').props.onBack();tree=render();tree.find(node=>node.type==='Header').props.onAction();tree=render();assert.equal(tree.find(node=>node.type==='Refresh').props.onRefresh,undefined);
 const main=()=>tree.find(node=>node.type==='Tabs'&&node.props.variant==='underline');
 assert.deepEqual(Array.from(main().props.tabs,tab=>tab.label),['Publicaciones','Solicitudes','Transacciones']);
 assert.equal(counterReads.at(-1).active,true);assert.equal(main().props.tabs[1].badgeCount,2);assert.equal(main().props.tabs[2].badgeCount,4);
 main().props.onSelect('requests');tree=render();let secondary=tree.find(node=>node.type==='PhysicalgoodsRequests'&&node.props.active);assert.equal(secondary.props.received,false);
 assert.equal(secondary.props.requestCounters,counters);
 secondary.props.onModeChange(true);tree=render();assert.equal(main().props.selected,'requests');
 assert.equal(tree.filter(node=>node.type==='PhysicalgoodsRequests'&&node.props.active).length,1);
 counters.counts={sentAccepted:0,receivedPending:0,pendingRequests:0,pendingTransactions:0};tree=render();assert.equal(main().props.tabs[1].badgeCount,0);assert.equal(main().props.tabs[2].badgeCount,0);
 main().props.onSelect('mine');tree=render();main().props.onSelect('requests');tree=render();secondary=tree.find(node=>node.type==='PhysicalgoodsRequests'&&node.props.active);assert.notEqual(secondary.props.received,false);
});
test('Biblioteca desactiva refresh de catálogo al publicar y deja al panel personal registrar su consulta',()=>{
 const h=runtime(),library={refresh:noop,loading:false,busy:false,formOpen:false,items:[],filters:{},page:1,title:'Borrador conservado'};
 const deps={react:h.react,'react/jsx-runtime':jsx,'react-native':{View:'View',Text:'Text',Pressable:'Button',KeyboardAvoidingView:'Keyboard',StyleSheet:{create:value=>value},Platform:{OS:'web'}},'@/components/RefreshScrollView':{RefreshScrollView:'Refresh'},'@/components/navigation/BottomNavigationBar':{},'@/features/auth/hooks/useAuth':{},'@/types/colors':{APP_COLORS:{}},'../hooks/useDigitalLibrary':{useDigitalLibrary:()=>library},'../../components/CatalogUI':{ScreenHeader:'Header',ui:{}},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:59,bottom:34})}};
 for(const name of ['DigitalPublicationForm','DigitalSearchForm','DigitalPersonalLibrary','DigitalResourceDetail','DigitalRecommendations','ResourceRow'])deps['./'+name]={[name]:name};
 const {Content}=load('elibrary/components/DigitalLibraryScreen.tsx',deps,{},'\nmodule.exports.Content=Library;');const render=()=>elements(h.render(Content));let tree=render();assert.equal(tree.find(node=>node.type==='Refresh').props.onRefresh,library.refresh);assert.equal(tree.find(node=>node.type==='Refresh').props.refreshIndicatorOffset,67);
 library.formOpen=true;tree=render();assert.equal(tree.find(node=>node.type==='Refresh').props.refreshEnabled,false);assert.equal(tree.find(node=>node.type==='Refresh').props.onRefresh,undefined);assert.equal(library.title,'Borrador conservado');
 library.formOpen=false;tree=render();tree.find(node=>node.type==='Header').props.onAction();tree=render();assert.equal(tree.find(node=>node.type==='Refresh').props.onRefresh,undefined);assert.ok(tree.some(node=>node.type==='DigitalPersonalLibrary'));
});
