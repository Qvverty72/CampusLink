import { useEffect,useRef,useState } from 'react';
import { downloadDigitalFile,loadAcquiredDigitalResource,loadAcquiredDigitalResources } from '../api/elibraryApi';
import { saveDigitalFile } from '../api/saveDigitalFile';
import type { DigitalAttachment,DigitalPublication } from '../types/publication';
export function useAcquiredDigitalResources(){
  const [open,setOpen]=useState(false),[items,setItems]=useState<DigitalPublication[]>([]),[detail,setDetail]=useState<DigitalPublication|null>(null),[page,setPage]=useState(1),[hasMore,setHasMore]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null),[revision,setRevision]=useState(0),[downloading,setDownloading]=useState<string|null>(null);
  const request=useRef<AbortController|null>(null),download=useRef<AbortController|null>(null);
  useEffect(()=>()=>{request.current?.abort();download.current?.abort();},[]);
  useEffect(()=>{if(!open)return;const abort=new AbortController();setLoading(true);setItems([]);setError(null);setHasMore(false);void loadAcquiredDigitalResources(page,abort.signal).then(result=>{if(!abort.signal.aborted){setItems(result.data);setHasMore(result.meta.hasMore);}}).catch(()=>{if(!abort.signal.aborted)setError('No se pudieron cargar tus materiales adquiridos.');}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();},[open,page,revision]);
  async function show(id:string){request.current?.abort();const abort=new AbortController();request.current=abort;setError(null);setLoading(true);try{const value=await loadAcquiredDigitalResource(id,abort.signal);if(!abort.signal.aborted)setDetail(value);}catch{if(!abort.signal.aborted)setError('No se encontró un material adquirido autorizado. Actualiza la lista.');}finally{if(!abort.signal.aborted)setLoading(false);}}
  async function save(file:DigitalAttachment){if(!detail||download.current)return;const abort=new AbortController();download.current=abort;setDownloading(file.id);setError(null);try{const blob=await downloadDigitalFile(detail.id,file,abort.signal);if(!abort.signal.aborted)await saveDigitalFile(blob,file);}catch{if(!abort.signal.aborted)setError('No se pudo descargar el archivo autorizado. Actualiza tu sesión o reintenta.');}finally{if(download.current===abort)download.current=null;if(!abort.signal.aborted)setDownloading(null);}}
  function close(){request.current?.abort();download.current?.abort();download.current=null;setDownloading(null);setDetail(null);setError(null);}
  return{open,items,detail,page,hasMore,loading,error,downloading,show,save,
    toggle:()=>{close();setOpen(value=>!value);},back:close,reload:()=>{close();setRevision(value=>value+1);},next:()=>{if(hasMore&&!loading){close();setPage(value=>value+1);}},previous:()=>{close();setPage(value=>Math.max(1,value-1));}};
}
