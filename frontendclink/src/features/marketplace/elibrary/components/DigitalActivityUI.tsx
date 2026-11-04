import {Text,View} from 'react-native';
import {useEffect} from 'react';
import {Pagination} from '@/components/Pagination';
import {RequestButton,RequestsPager} from '../../components/RequestsUI';
import {ui} from '../../components/CatalogUI';
import type {DigitalActivityPage,DigitalActivityRequest} from '../types/activity';
import type {RequestTone} from '../../components/RequestAccordionCard';
export const digitalAmount=(row:{modality:string;amount:number|null})=>row.modality==='DONACION'?'Donación':row.amount===null?'Precio no disponible':`$${row.amount.toLocaleString('es-CL')}`;
export function digitalRequestPresentation(row:DigitalActivityRequest):{label:string;tone:RequestTone}{
 if(row.transactionStatus==='COMPLETADA')return {label:'Transacción finalizada',tone:'completed'};
 if(row.transactionStatus==='CANCELADA'||row.status==='CANCELADA')return {label:'Transacción cancelada',tone:'closed'};
 if(row.status==='RECHAZADA')return {label:'Solicitud rechazada',tone:'rejected'};
 if(row.status==='ACEPTADA')return {label:'Solicitud aceptada',tone:'accepted'};
 return {label:'Esperando respuesta',tone:'pending'};
}
export function DigitalActivityFeedback({error,empty,onRetry}:{error:string|null;empty:boolean;onRetry:()=>void}){
 return error?<View style={{gap:8}}><Text accessibilityRole="alert" style={ui.subtitle}>{error}</Text><RequestButton label="Reintentar consulta" onPress={onRetry}/></View>
 :empty?<Text style={ui.subtitle}>No hay registros para mostrar en esta sección.</Text>:null;
}
export function DigitalActivityPager({meta,onChange,disabled=false,threshold=1,label}:{meta:DigitalActivityPage<unknown>['meta']|undefined;onChange:(page:number)=>void;disabled?:boolean;threshold?:number;label?:string}){
 useEffect(()=>{if(meta?.total!==undefined&&!disabled){const last=Math.max(1,Math.ceil(meta.total/meta.limit));if(meta.page>last)onChange(last);}},[meta?.page,meta?.total,meta?.limit,disabled,onChange]);
 if(!meta)return null;
 if(meta.total!==undefined){if(meta.total<threshold&&meta.page===1)return null;return <View pointerEvents={disabled?'none':'auto'}><Pagination page={meta.page} totalPages={Math.max(1,Math.ceil(meta.total/meta.limit))} showSinglePage={threshold>1} label={label} onPageChange={page=>{if(!disabled)onChange(page);}}/></View>;}
 return <RequestsPager page={meta.page} hasMore={meta.hasMore} disabled={disabled} onPrevious={()=>onChange(Math.max(1,meta.page-1))} onNext={()=>onChange(meta.page+1)}/>;
}
