import {useEffect,useRef} from 'react';
import {usePhysicalgoodsResources} from '../hooks/usePhysicalgoodsResources';
import {PhysicalgoodsManagement} from './PhysicalgoodsManagement';

/** Mismo administrador del catálogo, sin cargar su listado desde el historial propio. */
export function PhysicalgoodsPublicationManagement({id,onClose}:{id:string;onClose:()=>void}){
 const resources=usePhysicalgoodsResources(false),entered=useRef(false);
 useEffect(()=>{resources.open(id);},[id]);
 useEffect(()=>{if(resources.selectedId)entered.current=true;else if(entered.current)onClose();},[resources.selectedId,onClose]);
 return <PhysicalgoodsManagement resources={resources} onClose={onClose}/>;
}
