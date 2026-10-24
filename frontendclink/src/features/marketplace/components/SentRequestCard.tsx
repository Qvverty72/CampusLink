import type {ReactNode} from 'react';
import {Text,View} from 'react-native';
import {RequestAccordionCard,RequestAccordionSkeleton,RequestMessage,requestAccordionUI as styles,type RequestTone} from './RequestAccordionCard';

export type SentRequestTone=RequestTone;

/** Presentación compartida de una solicitud propia; no contiene DTO ni acciones de dominio. */
export function SentRequestCard({title,ownerName,campus,requestedAt,message,amount,amountLabel,summary,status,tone,expanded,disabled=false,onToggle,children}:{
  title:string;ownerName:string;campus:string;requestedAt:string;message:string;amount:string;amountLabel:string;
  summary:string;status:string;tone:SentRequestTone;expanded:boolean;disabled?:boolean;onToggle:()=>void;children?:ReactNode;
}) {
  const date=new Date(requestedAt),valid=!Number.isNaN(date.getTime());
  const shortDate=valid?date.toLocaleDateString('es-CL',{day:'numeric',month:'short'}):'Sin fecha';
  const fullDate=valid?date.toLocaleString('es-CL',{day:'2-digit',month:'2-digit',year:'numeric',hour:'numeric',minute:'2-digit'}):'Fecha no disponible';
  return <RequestAccordionCard title={title} initialName={ownerName} subtitle={expanded?campus:`${summary} · ${shortDate}`} trailing={expanded?shortDate:amount}
    tone={tone} expanded={expanded} disabled={disabled} onToggle={onToggle}>
      <View style={styles.amountRow}><Text style={styles.amountLabel}>{amountLabel}</Text><Text style={styles.amount}>{amount}</Text></View>
      <RequestMessage message={message} caption={`Tú, mensaje enviado el ${fullDate}`} status={status} tone={tone}/>
      {children}
  </RequestAccordionCard>;
}

export function SentRequestsSkeleton({expanded=false}:{expanded?:boolean}){
  return <RequestAccordionSkeleton label="Cargando solicitudes enviadas" expanded={expanded}/>;
}
