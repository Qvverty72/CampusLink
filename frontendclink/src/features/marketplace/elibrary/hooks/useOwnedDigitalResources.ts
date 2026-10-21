import { useEffect,useRef,useState } from 'react';
import { loadOwnedDigitalResource,loadOwnedDigitalResources } from '../api/elibraryApi';
import type { DigitalPublication } from '../types/publication';
export function useOwnedDigitalResources(){
  const [open,setOpen]=useState(false),[items,setItems]=useState<DigitalPublication[]>([]),[selected,setSelected]=useState<DigitalPublication|null>(null),[page,setPage]=useState(1),[hasMore,setHasMore]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null),[revision,setRevision]=useState(0);
  const pending=useRef<AbortController|null>(null);useEffect(()=>()=>pending.current?.abort(),[]);
  useEffect(()=>{if(!open)return;const abort=new AbortController();setLoading(true);setItems([]);setHasMore(false);void loadOwnedDigitalResources(page,abort.signal).then(result=>{if(!abort.signal.aborted){setItems(result.data);setHasMore(result.meta.hasMore);}}).catch(()=>{if(!abort.signal.aborted)setError('No se pudieron cargar tus publicaciones.');}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();},[open,page,revision]);
  async function edit(id:string){pending.current?.abort();const abort=new AbortController();pending.current=abort;setError(null);try{const value=await loadOwnedDigitalResource(id,abort.signal);if(!abort.signal.aborted)setSelected(value);}catch{if(!abort.signal.aborted)setError('No se pudo abrir tu publicación.');}}
  function close(){pending.current?.abort();setSelected(null);setError(null);setRevision(value=>value+1);}
  return{open,items,selected,page,hasMore,loading,error,edit,close,saved:close,toggle:()=>{close();setOpen(value=>!value);},next:()=>setPage(value=>value+1),previous:()=>setPage(value=>Math.max(1,value-1)),reload:()=>setRevision(value=>value+1)};
}
