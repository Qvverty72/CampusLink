import { authenticatedEnvelopeRequest, authenticatedRequest } from '@/lib/api/authenticated-request';
import type { DigitalRequest,DigitalRequestOptions,DigitalTrade } from '../types/trade';
import type { DigitalPage } from '../types/publication';
import type { DigitalMessage } from '../types/trade';
const base='/api/v1/marketplace/elibrary';
const json=(body:unknown)=>({headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
export const loadDigitalMessages = (trade: Pick<DigitalTrade,'publicationId'|'id'>, page: number, signal?: AbortSignal) =>
  authenticatedEnvelopeRequest<DigitalMessage[], DigitalPage>(`${base}/${trade.publicationId}/transactions/${trade.id}/messages`, { signal }, new URLSearchParams({page:String(page),limit:'20'}));
export const sendDigitalMessage = (trade: Pick<DigitalTrade,'publicationId'|'id'>, text: string, messageId: string, signal?: AbortSignal) =>
  authenticatedRequest<DigitalMessage>(`${base}/${trade.publicationId}/transactions/${trade.id}/messages`, {method:'POST',...json({text,messageId}),signal});
export const loadDigitalRequestOptions=(id:string,signal?:AbortSignal)=>authenticatedRequest<DigitalRequestOptions>(`${base}/${id}/request-options`,{signal});
export const requestDigitalResource=(id:string,messageCode:string,signal?:AbortSignal,key?:string)=>authenticatedRequest<DigitalRequest>(`${base}/${id}/requests`,{method:'POST',...json({messageCode}),headers:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},signal});
export const loadDigitalRequests=(received:boolean,page:number,signal?:AbortSignal)=>authenticatedEnvelopeRequest<DigitalRequest[],DigitalPage>(`${base}/requests/${received?'received':'sent'}`,{signal},new URLSearchParams({page:String(page),limit:'20'}));
export const resolveDigitalRequest=(row:DigitalRequest,decision:'ACEPTAR'|'RECHAZAR',signal?:AbortSignal)=>authenticatedRequest<DigitalRequest>(`${base}/${row.publicationId}/requests/${row.id}`,{method:'PATCH',...json({decision}),signal});
export const loadDigitalTrade=(publicationId:string,id:string,signal?:AbortSignal)=>authenticatedRequest<DigitalTrade>(`${base}/${publicationId}/transactions/${id}`,{signal});
export const transitionDigitalTrade=(trade:DigitalTrade,action:'confirm'|'cancel',signal?:AbortSignal)=>authenticatedRequest<DigitalTrade>(`${base}/${trade.publicationId}/transactions/${trade.id}/${action}`,{method:'POST',...json({}),signal});
export const rateDigitalOwner=(trade:DigitalTrade,score:number,signal?:AbortSignal)=>authenticatedRequest<{id:string;score:number;createdAt:string}>(`${base}/${trade.publicationId}/transactions/${trade.id}/rating`,{method:'POST',...json({score}),signal});
