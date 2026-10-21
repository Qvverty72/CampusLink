/** Entrada común: las relaciones, identidad, fecha y estado los determina el servidor. */
export interface ContentReportInput { reason:string;description?:string }
export interface ContentReportReceipt {id:string;campusId:string;status:'PENDIENTE';reportedAt:string}
export type ContentReportTarget = {type:'ACTIVIDAD';activityId:string}
  | {type:'PUBLICACION_FISICA';publicationId:string}
  | {type:'TRANSACCION';publicationId:string;transactionId:string}
  | {type:'PUBLICACION_DIGITAL';publicationId:string;campusId:string}
  | {type:'TRANSACCION_DIGITAL';publicationId:string;transactionId:string;campusId:string};
export interface PhysicalgoodsReportReceipt extends ContentReportReceipt {publicationId:string;transactionId:string|null}
