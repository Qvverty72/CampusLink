import type {DigitalRequest,DigitalTrade} from './trade';
export interface DigitalActivityCounts {sentAccepted:number;receivedPending:number;pendingRequests:number;pendingTransactions:number}
export interface DigitalActivityRequest extends DigitalRequest {
 ownerName:string;campusName:string;careers:string[];publishedAt:string;modality:'VENTA'|'DONACION';amount:number|null;
 publicationStatus:string;isWithdrawn:boolean;canResolve:boolean;canAccept:boolean;
 averageRating?:number|null;ratingCount?:number;
}
export interface DigitalActivityResource {publicationId:string;title:string;campusName:string;modality:'VENTA'|'DONACION';amount:number|null;total:number;pending:number;active:number;completed:number;publishedAt:string}
export interface DigitalActivityPage<T> {data:T[];meta:{page:number;limit:number;hasMore:boolean;total?:number;counts?:{active:number;finished:number}}}
export type DigitalActivityTrade=DigitalTrade;
