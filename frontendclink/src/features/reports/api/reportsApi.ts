import { authenticatedEnvelopeRequest } from '@/lib/api/authenticated-request';

import type { ActivityReportInput, ActivityReportReceipt } from '../types/activityReport';
import type { ContentReportInput, ContentReportTarget, PhysicalgoodsReportReceipt } from '../types/contentReport';

/** Envía una denuncia y valida que el recibo corresponda al campus y actividad solicitados. */
export async function submitActivityReport(campusId: string, activityId: string, input: ActivityReportInput,
  signal?: AbortSignal): Promise<ActivityReportReceipt> {
  if (!/^[0-9a-f]{24}$/i.test(activityId)) throw new Error('Identificador de actividad inválido.');
  const response = await authenticatedEnvelopeRequest<ActivityReportReceipt>(`/api/v1/reports/activities/${activityId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal,
  });
  const receipt = response.data;
  if (!receipt || !/^[0-9a-f-]{36}$/i.test(receipt.id) || receipt.campusId !== campusId
    || receipt.activityId !== activityId.toLowerCase() || receipt.status !== 'PENDIENTE'
    || !Number.isFinite(Date.parse(receipt.reportedAt))) throw new Error('No se pudo confirmar el envío de la denuncia.');
  return receipt;
}

/** Denuncia física desde contenido accesible o un acuerdo propio; solo devuelve el acuse privado. */
export async function submitPhysicalgoodsReport(campusId:string,target:Extract<ContentReportTarget,{type:'PUBLICACION_FISICA'|'TRANSACCION'}>,
  input:ContentReportInput,signal?:AbortSignal):Promise<PhysicalgoodsReportReceipt> {
  const validId=(id:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if(!validId(target.publicationId)||(target.type==='TRANSACCION'&&!validId(target.transactionId)))throw new Error('Identificador inválido para denunciar.');
  const transactionId=target.type==='TRANSACCION'?target.transactionId.toLowerCase():null;
  const path='/api/v1/reports/physicalgoods/'+target.publicationId+(transactionId?'/transactions/'+transactionId:'');
  const {data:receipt}=await authenticatedEnvelopeRequest<PhysicalgoodsReportReceipt>(path,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal,
  });
  if(!receipt||!validId(receipt.id)||receipt.campusId!==campusId||receipt.publicationId!==target.publicationId.toLowerCase()
    ||receipt.transactionId!==transactionId||receipt.status!=='PENDIENTE'||!Number.isFinite(Date.parse(receipt.reportedAt)))throw new Error('No se pudo confirmar el envío de la denuncia.');
  return receipt;
}
/** El caso digital corresponde al campus de origen del recurso, derivado y comprobado por el backend. */
export async function submitDigitalReport(target:Extract<ContentReportTarget,{type:'PUBLICACION_DIGITAL'|'TRANSACCION_DIGITAL'}>,input:ContentReportInput,signal?:AbortSignal):Promise<PhysicalgoodsReportReceipt>{
  const validId=(id:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const transactionId=target.type==='TRANSACCION_DIGITAL'?target.transactionId.toLowerCase():null;
  if(!validId(target.publicationId)||!validId(target.campusId)||(transactionId&&!validId(transactionId)))throw new Error('Identificador inválido para denunciar.');
  const path='/api/v1/reports/elibrary/'+target.publicationId+(transactionId?'/transactions/'+transactionId:'');
  const {data:receipt}=await authenticatedEnvelopeRequest<PhysicalgoodsReportReceipt>(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal});
  if(!receipt||!validId(receipt.id)||receipt.campusId!==target.campusId||receipt.publicationId!==target.publicationId.toLowerCase()||receipt.transactionId!==transactionId||receipt.status!=='PENDIENTE'||!Number.isFinite(Date.parse(receipt.reportedAt)))throw new Error('No se pudo confirmar el envío de la denuncia.');
  return receipt;
}
