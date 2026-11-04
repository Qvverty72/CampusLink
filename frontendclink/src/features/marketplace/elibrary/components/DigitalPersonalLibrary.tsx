import type { ScrollViewInstance } from 'react-native';
import {useEffect,useRef,useState} from 'react';
import {ScrollView,View} from 'react-native';
import {CatalogTabs} from '../../components/CatalogUI';
import {DigitalPublications} from './DigitalPublications';
import {DigitalActivityRequests} from './DigitalActivityRequests';
import {DigitalActivityTransactions} from './DigitalActivityTransactions';
import {DigitalAcquiredActivity} from './DigitalAcquiredActivity';
import {useDigitalActivityCounts} from '../hooks/useDigitalActivity';

type Tab='owned'|'requests'|'transactions'|'acquired';
export function DigitalPersonalLibrary({initialTab='acquired',initialPublicationId,onExplore,onPublish,onTitleChange,onOpenResource,activityCounters}:{initialTab?:Tab|'trades';initialPublicationId?:string;onExplore?:()=>void;onPublish?:()=>void;onTitleChange?:(title:string)=>void;onOpenResource?:(id:string)=>void;activityCounters?:ReturnType<typeof useDigitalActivityCounts>}={}){
 const first:Tab=initialTab==='trades'?'requests':initialTab;
 const [tab,setTab]=useState<Tab>(first),[visited,setVisited]=useState<Record<Tab,boolean>>({owned:first==='owned',requests:first==='requests',transactions:first==='transactions',acquired:first==='acquired'});
 const [receivedEntry,setReceivedEntry]=useState(0),[acquiredEntry,setAcquiredEntry]=useState({id:initialPublicationId,version:0});
 const ownCounters=useDigitalActivityCounts(!activityCounters);
 const counts=activityCounters??ownCounters;
 const tabsScroll=useRef<ScrollViewInstance>(null);
 const select=(next:Tab)=>{setVisited(old=>({...old,[next]:true}));setTab(next);};
 const reviewRequests=()=>{setReceivedEntry(value=>value+1);select('requests');};
 const openAcquired=(id:string)=>{setAcquiredEntry(old=>({id,version:old.version+1}));select('acquired');};
 useEffect(()=>{onTitleChange?.(tab==='owned'?'Mis publicaciones':tab==='requests'?'Mis Solicitudes':tab==='transactions'?'Mis transacciones':'Materiales adquiridos');},[tab,onTitleChange]);
 const positionTabs=()=>{if(tab==='requests'||tab==='transactions')tabsScroll.current?.scrollToEnd({animated:false});else tabsScroll.current?.scrollTo({x:0,animated:false});};
 useEffect(positionTabs,[tab]);
 return <View style={{gap:16}}>
 <ScrollView ref={tabsScroll} horizontal showsHorizontalScrollIndicator={false} onContentSizeChange={positionTabs}><CatalogTabs variant="underline" selected={tab} onSelect={select} tabs={[
 {id:'acquired',label:'Adquiridos'},{id:'owned',label:'Publicaciones'},
 {id:'requests',label:'Solicitudes',badgeCount:counts.counts?.pendingRequests,badgeLabel:'solicitudes pendientes'},
 {id:'transactions',label:'Transacciones',badgeCount:counts.counts?.pendingTransactions,badgeLabel:'transacciones pendientes'},
 ]}/></ScrollView>
 {visited.owned&&<View style={tab==='owned'?undefined:{display:'none'}}><DigitalPublications active={tab==='owned'} onRequests={reviewRequests} onPublish={onPublish} onChanged={counts.reload} onOpenResource={onOpenResource}/></View>}
 {visited.requests&&<View style={tab==='requests'?undefined:{display:'none'}}><DigitalActivityRequests active={tab==='requests'} counts={counts.counts} countsLoading={counts.loading} onChanged={counts.reload} initialReceived={receivedEntry>0} entryVersion={receivedEntry}/></View>}
 {visited.transactions&&<View style={tab==='transactions'?undefined:{display:'none'}}><DigitalActivityTransactions active={tab==='transactions'} onChanged={counts.reload} onAcquired={openAcquired} onExplore={onExplore}/></View>}
 {visited.acquired&&<View style={tab==='acquired'?undefined:{display:'none'}}><DigitalAcquiredActivity active={tab==='acquired'} initialPublicationId={acquiredEntry.id} entryVersion={acquiredEntry.version} onExplore={onExplore}/></View>}
 </View>;
}
