import {authenticatedEnvelopeRequest,authenticatedRequest} from '@/lib/api/authenticated-request';
import type {DigitalActivityCounts,DigitalActivityPage} from '../types/activity';
import type {DigitalPublication} from '../types/publication';
const base='/api/v1/marketplace/elibrary/activity';
export function loadDigitalActivityPage<T>(kind:string,query:string,signal:AbortSignal){
 return authenticatedEnvelopeRequest<T[],DigitalActivityPage<T>['meta']>(`${base}/${kind}`,{signal},new URLSearchParams(query));
}
export const loadDigitalActivityCounts=(signal:AbortSignal)=>authenticatedRequest<DigitalActivityCounts>(base+'/counts',{signal});
export const loadDigitalActivityResource=(id:string,signal:AbortSignal)=>authenticatedRequest<DigitalPublication>(`${base}/resource/${id}`,{signal});
