export interface DigitalRequestOptions { canRequest:boolean;acquired:boolean;activeRequestId:string|null;messages:{code:string;description:string}[] }
export interface DigitalRequest {
  id:string;publicationId:string;title:string;ownerId:string;requesterId:string;requesterName:string;
  status:string;messageCode:string;message:string;requestedAt:string;transactionId:string|null;transactionStatus:string|null;
}
export interface DigitalTrade {
  participants?:{id:string;name:string;role:string}[];
  id:string;publicationId:string;campusId:string;title:string;ownerId:string;receiverId:string;status:string;modality:'VENTA'|'DONACION';amount:number|null;currency:string;
  startedAt:string;completedAt:string|null;cancelledAt:string|null;confirmations:{userId:string;role:string;confirmedAt:string}[];canConfirm:boolean;canCancel:boolean;
  rating:{id:string;score:number;createdAt:string}|null;canRate:boolean;
}
export interface DigitalTradeTarget { publicationId: string; transactionId: string; title: string }
