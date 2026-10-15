import type { ContentReportInput, ContentReportReceipt } from './contentReport';
/** Motivo requerido y descripción opcional enviados para denunciar una actividad. */
export type ActivityReportInput = ContentReportInput;
/** Acuse de una denuncia pendiente; no implica ocultamiento ni decisión de moderación. */
export interface ActivityReportReceipt extends ContentReportReceipt {activityId:string}
