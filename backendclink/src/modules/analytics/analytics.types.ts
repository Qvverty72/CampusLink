import type { ModuleHealth } from '../../types/api.types.js';

export type AnalyticsHealth = ModuleHealth<'analytics'>;

export interface ResourceAnalyticsEvent {
  key: string;
  type: 'VISTA' | 'SOLICITUD_CREADA' | 'TRANSACCION_RESERVADA' | 'TRANSACCION_PENDIENTE_CONFIRMACION' | 'TRANSACCION_COMPLETADA' | 'TRANSACCION_CANCELADA';
  campusId: string;
  publicationId: string;
  userId: string | null;
  requestId: string | null;
  transactionId: string | null;
  occurredAt: string;
}
