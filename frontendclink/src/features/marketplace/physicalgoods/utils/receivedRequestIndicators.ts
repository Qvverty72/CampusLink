import type {PhysicalgoodsReceivedRequest} from '../types/publication';

type RequestState=Pick<PhysicalgoodsReceivedRequest,'status'|'transaction'>;

/** Solicitudes por responder; las transacciones en curso se cuentan aparte en el agregado del servidor. */
export function isReceivedRequestAwaitingResponse(row:RequestState){
  return row.status==='PENDIENTE'&&!row.transaction;
}

/** Misma prioridad que la paginación por recurso del backend. */
export function receivedResourcePriority(rows:RequestState[]){
  if(rows.some(row=>row.transaction?.status==='RESERVADA'||row.transaction?.status==='PENDIENTE_CONFIRMACION'))return 0;
  if(rows.some(isReceivedRequestAwaitingResponse))return 1;
  if(rows.some(row=>row.transaction?.status==='COMPLETADA'))return 3;
  return 2;
}

export function compareReceivedResources(a:PhysicalgoodsReceivedRequest[],b:PhysicalgoodsReceivedRequest[]){
  const priority=receivedResourcePriority(a)-receivedResourcePriority(b);
  if(priority)return priority;
  const aDate=Date.parse(a[0].publication.publishedAt??''),bDate=Date.parse(b[0].publication.publishedAt??'');
  // Servidores anteriores conservan su orden; la fecha de solicitud no es la de publicación.
  if(!Number.isFinite(aDate)||!Number.isFinite(bDate))return 0;
  // PostgreSQL conserva microsegundos que Date.parse redondea a milisegundos.
  const fraction=(date:string)=>(date.match(/\.(\d+)/)?.[1]??'').padEnd(6,'0');
  return bDate-aDate||fraction(b[0].publication.publishedAt!).localeCompare(fraction(a[0].publication.publishedAt!))
    ||a[0].publication.id.localeCompare(b[0].publication.id);
}

/** La confirmación de una sola parte todavía es una transacción pendiente. */
export function receivedTransactionLabel(rows:RequestState[]){
  const transactions=new Map(rows.flatMap(row=>row.transaction?[[row.transaction.id,row.transaction] as const]:[]));
  const pending=[...transactions.values()].filter(row=>row.status==='RESERVADA'||row.status==='PENDIENTE_CONFIRMACION').length;
  const completed=[...transactions.values()].filter(row=>row.status==='COMPLETADA').length;
  const cancelled=[...transactions.values()].filter(row=>row.status==='CANCELADA').length;
  if(pending)return `${pending} transacci${pending===1?'ón pendiente':'ones pendientes'}`;
  if(completed)return completed===1?'Transacción finalizada':`${completed} transacciones finalizadas`;
  if(cancelled&&!rows.some(isReceivedRequestAwaitingResponse))return cancelled===1?'Transacción cancelada':`${cancelled} transacciones canceladas`;
  return '0 transacciones pendientes';
}
