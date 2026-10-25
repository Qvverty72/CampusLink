import {useEffect,useRef,useState} from 'react';
import {View} from 'react-native';
import {useAcquiredDigitalResources} from '../hooks/useAcquiredDigitalResources';
import {useMarketplaceRefresh} from '../../hooks/useMarketplaceRefresh';
import {PublicationActivityRow,PublicationActivitySkeleton,publicationActivityUI as styles} from '../../components/PublicationActivityUI';
import {RequestsPager,RequestButton} from '../../components/RequestsUI';
import {DigitalActivityFeedback} from './DigitalActivityUI';
import {DigitalResourceModal} from './DigitalActivityResource';
export function DigitalAcquiredActivity({active,initialPublicationId,entryVersion=0,onExplore}:{active:boolean;initialPublicationId?:string;entryVersion?:number;onExplore?:()=>void}){
 const state=useAcquiredDigitalResources(true),[selected,setSelected]=useState<string|null>(initialPublicationId??null);
 useEffect(()=>{if(initialPublicationId)setSelected(initialPublicationId);},[initialPublicationId,entryVersion]);
 const entered=useRef(false);
 useEffect(()=>{if(active){if(entered.current)state.reload();entered.current=true;}},[active]);
 useMarketplaceRefresh(state.reload,state.loading,!selected&&!state.loading,'mis materiales adquiridos',active);
 return <View style={styles.section}>{state.loading&&!state.items.length?<PublicationActivitySkeleton variant="acquired" label="Cargando materiales adquiridos"/>:<>
 <DigitalActivityFeedback error={state.error} empty={!state.items.length} onRetry={state.reload}/>
 {!state.items.length&&!state.error&&onExplore&&<RequestButton label="Explorar Biblioteca" onPress={onExplore} primary/>}
 <View style={styles.history}>{state.items.map(row=><PublicationActivityRow key={row.id} digital title={row.title} amount={row.acquisition?.modality==='DONACION'?'Donación':`$${Number(row.acquisition?.amount??row.price).toLocaleString('es-CL')}`}
 subtitle={`${row.campusName}${row.acquisition?` · ${new Date(row.acquisition.acquiredAt).toLocaleDateString('es-CL')}`:''}`} status="Adquirido" statusTone="finished" onPress={()=>setSelected(row.id)}/>)}</View>
 <RequestsPager page={state.page} hasMore={state.hasMore} disabled={state.loading} onPrevious={state.previous} onNext={state.next}/>
 </>}{selected&&<DigitalResourceModal id={selected} title="Tu material adquirido" mode="acquired" onClose={()=>setSelected(null)}/>}</View>;
}
