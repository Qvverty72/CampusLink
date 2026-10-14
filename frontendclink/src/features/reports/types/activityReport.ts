/** Motivo requerido y descripción opcional enviados para denunciar una actividad. */
export interface ActivityReportInput { reason: string; description?: string }
/** Acuse de una denuncia pendiente; no implica ocultamiento ni decisión de moderación. */
export interface ActivityReportReceipt {
  id: string; activityId: string; campusId: string; status: 'PENDIENTE'; reportedAt: string;
}
