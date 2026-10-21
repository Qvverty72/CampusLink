import { useEffect,useRef,useState } from 'react';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { editDigitalContent,loadOwnedDigitalResource,retireDigitalResource } from '../api/elibraryApi';
import type { DigitalPublication } from '../types/publication';
export function useEditDigitalPublication(initial:DigitalPublication,onSaved:(value:DigitalPublication)=>void){
  const [resource,setResource]=useState(initial),[title,setTitle]=useState(initial.title),[description,setDescription]=useState(initial.description),[modality,setModality]=useState(initial.modality),[price,setPrice]=useState(initial.price?.toString()??''),[retiring,setRetiring]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[mustReload,setMustReload]=useState(false);
  const pending=useRef<AbortController|null>(null),saving=useRef(false);useEffect(()=>()=>pending.current?.abort(),[]);
  async function reload(){if(saving.current)return;pending.current?.abort();const abort=new AbortController();pending.current=abort;setBusy(true);try{const value=await loadOwnedDigitalResource(resource.id,abort.signal);if(!abort.signal.aborted){setResource(value);setTitle(value.title);setDescription(value.description);setModality(value.modality);setPrice(value.price?.toString()??'');setError(null);setMustReload(false);setRetiring(false);}}catch{if(!abort.signal.aborted)setError('No se pudo recargar la publicación.');}finally{if(!abort.signal.aborted)setBusy(false);}}
  async function submit(remove=false){if(saving.current||mustReload)return;const amount=Number(price.trim().replace(',','.'));if(!remove&&(!title.trim()||!description.trim()||(modality==='VENTA'&&(!Number.isFinite(amount)||amount<=0||amount>Number.MAX_SAFE_INTEGER)))){setError('Completa título, descripción y un precio positivo para venta.');return;}
    saving.current=true;setBusy(true);setError(null);const abort=new AbortController();pending.current=abort;
    try{const value=remove?await retireDigitalResource(resource.id,resource.updatedAt,abort.signal):await editDigitalContent(resource.id,{title,description,modality,price:modality==='VENTA'?amount:null,updatedAt:resource.updatedAt},abort.signal);if(!abort.signal.aborted)onSaved(value);}
    catch(reason){if(!abort.signal.aborted){setError(reason instanceof AuthApiError?reason.serverMessage??'No se pudo guardar.':'No se pudo confirmar la operación. Recarga antes de reintentar.');if(!(reason instanceof AuthApiError)||[409,503].includes(reason.status))setMustReload(true);}}
    finally{saving.current=false;if(!abort.signal.aborted)setBusy(false);}}
  return{resource,title,setTitle,description,setDescription,modality,setModality:(value:'VENTA'|'DONACION')=>{setModality(value);if(value==='DONACION')setPrice('');},price,setPrice,retiring,setRetiring,busy,error,mustReload,reload,save:()=>submit(),retire:()=>submit(true)};
}
