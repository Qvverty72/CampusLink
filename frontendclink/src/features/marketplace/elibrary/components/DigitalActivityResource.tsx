import {useEffect,useRef,useState} from 'react';
import {Text,View} from 'react-native';
import {FileText} from 'lucide-react-native';
import {Skeleton,SkeletonBlock} from '@/components/Skeleton';
import {loadDigitalActivityResource} from '../api/digitalActivityApi';
import {loadAcquiredDigitalResource,loadOwnedDigitalResource,downloadDigitalFile} from '../api/elibraryApi';
import {saveDigitalFile} from '../api/saveDigitalFile';
import type {DigitalAttachment,DigitalPublication} from '../types/publication';
import type {DigitalTrade} from '../types/trade';
import {AgreementProductDetails} from '../../components/AgreementProductUI';
import {AgreementStepModal} from '../../components/AgreementStepModal';
import {RequestButton} from '../../components/RequestsUI';
import {CATALOG_COLORS as colors,ui} from '../../components/CatalogUI';
import {DigitalPreview} from './DigitalPreview';

/** Same resource presentation in publication, request and transaction panels. */
export function DigitalResourceContent({id,mode='resource',initial,trade,onEdit,onBusyChange,onOpen}:{id:string;mode?:'resource'|'owned'|'acquired';initial?:DigitalPublication;trade?:DigitalTrade;onEdit?:(resource:DigitalPublication)=>void;onBusyChange?:(busy:boolean)=>void;onOpen?:()=>void}){
 const [data,setData]=useState<DigitalPublication|null>(initial??null),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null),[revision,setRevision]=useState(0),[downloading,setDownloading]=useState<string|null>(null);
 const download=useRef<AbortController|null>(null);
 useEffect(()=>{const abort=new AbortController();setLoading(true);setError(null);
 const load=mode==='owned'?loadOwnedDigitalResource:mode==='acquired'?loadAcquiredDigitalResource:loadDigitalActivityResource;
 void load(id,abort.signal).then(value=>{if(!abort.signal.aborted)setData(value);}).catch(()=>{if(!abort.signal.aborted){setData(null);setError('No se pudo consultar este recurso autorizado.');}}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
 return()=>abort.abort();},[id,mode,revision]);
 useEffect(()=>()=>{download.current?.abort();},[]);
 useEffect(()=>{onBusyChange?.(Boolean(downloading));},[downloading,onBusyChange]);
 async function save(file:DigitalAttachment){if(!data||loading||error||download.current)return;const abort=new AbortController();download.current=abort;setDownloading(file.id);
 try{const blob=await downloadDigitalFile(id,file,abort.signal);if(!abort.signal.aborted)await saveDigitalFile(blob,file);}catch{if(!abort.signal.aborted)setError('No se pudo descargar el archivo autorizado. Actualiza antes de reintentar.');}
 finally{if(download.current===abort)download.current=null;if(!abort.signal.aborted)setDownloading(null);}}
 if(!data&&loading)return <Skeleton label="Cargando recurso digital" contentStyle={{gap:14}}><SkeletonBlock height={80}/><SkeletonBlock width="80%" height={24}/><SkeletonBlock height={100}/><SkeletonBlock height={76}/></Skeleton>;
 if(!data)return <View style={{gap:12}}><Text accessibilityRole="alert" style={ui.subtitle}>{error}</Text><RequestButton label="Reintentar recurso" onPress={()=>setRevision(value=>value+1)}/></View>;
 const amount=trade?.amount??data.acquisition?.amount??data.price,modality=trade?.modality??data.acquisition?.modality??data.modality;
 return <View style={{gap:16}}>
 <AgreementProductDetails title={data.title} modality={modality} amount={modality==='DONACION'?null:amount===null?null:Number(amount)} currency={trade?.currency??data.currency??'CLP'} campus={data.campusName}
 startedAt={trade?.startedAt??data.acquisition?.acquiredAt??data.updatedAt} dateLabel={trade?undefined:data.acquisition?`Adquirido el ${new Date(data.acquisition.acquiredAt).toLocaleDateString('es-CL')}`:null}
 tags={[...data.careers,...data.subjects].map(row=>row.name)} description={data.description}>
 <View style={{padding:22,backgroundColor:colors.tint,alignItems:'center',gap:8}}><FileText size={42} color={colors.secondary}/><Text style={ui.subtitle}>{data.files.length} archivo{data.files.length===1?'':'s'} académico{data.files.length===1?'':'s'}</Text></View>
 </AgreementProductDetails>
 {data.isWithdrawn&&<Text style={ui.subtitle}>Publicación desactivada. El historial y los accesos adquiridos se conservan.</Text>}
 {error&&<><Text accessibilityRole="alert" style={ui.subtitle}>{error}</Text><RequestButton label="Actualizar recurso" onPress={()=>setRevision(value=>value+1)} disabled={Boolean(downloading)}/></>}
 {data.activity&&<Text style={ui.subtitle}>{data.activity.pendingRequests} solicitudes pendientes · {data.activity.completedAgreements} transacciones completadas</Text>}
 {data.files.map(file=><View key={file.id} style={{gap:10,padding:14,borderRadius:14,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface}}>
 <Text style={ui.label}>{file.name}</Text><Text style={ui.subtitle}>{file.sizeBytes<1024*1024?`${Math.max(1,Math.ceil(file.sizeBytes/1024))} KB`:`${(file.sizeBytes/1024/1024).toLocaleString('es-CL',{maximumFractionDigits:2})} MB`}</Text>
 {mode==='acquired'||mode==='owned'?<RequestButton label={downloading===file.id?'Descargando…':'Descargar archivo completo'} onPress={()=>void save(file)} disabled={loading||Boolean(downloading)||Boolean(error)} primary/>
 :!data.isWithdrawn&&!loading&&<DigitalPreview publicationId={id} fileId={file.id} name={file.name}/>}
 </View>)}
 {onEdit&&<RequestButton label="Gestionar publicación" disabled={loading||Boolean(error)||Boolean(downloading)} onPress={()=>onEdit(data)} primary/>}
 {onOpen&&!data.isWithdrawn&&data.status==='DISPONIBLE'&&<RequestButton label="Administrar archivos y clasificación" disabled={loading||Boolean(error)||Boolean(downloading)} onPress={onOpen}/>}
 </View>;
}
export function DigitalResourceModal({id,title,onClose,initial,mode,onEdit,onOpen}:{id:string;title:string;onClose:()=>void;initial?:DigitalPublication;mode?:'resource'|'owned'|'acquired';onEdit?:(resource:DigitalPublication)=>void;onOpen?:()=>void}){
 const [busy,setBusy]=useState(false);
 return <AgreementStepModal title={title} closeLabel="Cerrar recurso" onClose={onClose} closeDisabled={busy} fillHeight>
 <DigitalResourceContent key={`${mode}:${id}`} id={id} initial={initial} mode={mode} onEdit={onEdit} onBusyChange={setBusy} onOpen={onOpen}/></AgreementStepModal>;
}
