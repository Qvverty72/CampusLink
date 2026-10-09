import { authenticatedEnvelopeRequest, authenticatedRequest } from '@/lib/api/authenticated-request';

export interface AuditEntry {
  id: string; actor_usuario_id: string | null; institucion_id: string; campus_id: string;
  entidad_tipo: string; entidad_id: string; accion: string; created_at: string;
}
export interface AuditDetail extends AuditEntry {
  justificacion_accion: string | null; reporte_contenido_id: string | null;
  datos_antes: Record<string, unknown> | null; datos_despues: Record<string, unknown> | null;
}
const path = (campusId: string) => '/api/v1/users/access/campuses/' + encodeURIComponent(campusId) + '/audit';
export const loadAuditEntries = (campusId: string, page: number, signal: AbortSignal) =>
  authenticatedEnvelopeRequest<AuditEntry[], { page: number; limit: number; hasMore: boolean }>(path(campusId), { signal },
    new URLSearchParams({ page: String(page), limit: '20' }));
export const loadAuditEntry = (campusId: string, id: string, signal: AbortSignal) =>
  authenticatedRequest<AuditDetail>(path(campusId) + '/' + encodeURIComponent(id), { signal });

export const auditLabels: Record<string,string> = {
  ASIGNAR_ROL: 'Asignación de rol', REVOCAR_ROL: 'Revocación de rol',
  ASIGNAR_PERMISO: 'Asignación de permiso', REVOCAR_PERMISO: 'Revocación de permiso',
  SUSPENDER_CUENTA: 'Suspensión de cuenta', DESACTIVAR_CUENTA: 'Desactivación de cuenta', REACTIVAR_CUENTA: 'Reactivación de cuenta',
  OCULTAR_PUBLICACION: 'Publicación ocultada', RESTAURAR_PUBLICACION: 'Publicación restaurada',
  RESOLVER_DENUNCIA: 'Denuncia resuelta', DESESTIMAR_DENUNCIA: 'Denuncia desestimada',
  perfil_usuario: 'Cuenta', publicacion_recurso: 'Publicación', reporte_contenido: 'Denuncia',
  id: 'Identificador', institucion_id: 'Institución', campus_id: 'Campus', nombre_completo: 'Nombre', estado_cuenta: 'Estado de cuenta',
  deleted_at: 'Retirada en', updated_at: 'Actualizado en', roles: 'Roles', permissions: 'Permisos',
  assignmentId: 'Asignación afectada', catalogId: 'Rol o permiso afectado', catalog_id: 'Rol o permiso', nombre: 'Nombre',
  action: 'Acción',
  perfil_usuario_id: 'Usuario', rol_id: 'Rol', permiso_id: 'Permiso', revocado_en: 'Revocado en',
  asignado_por_id: 'Asignado por', otorgado_por_id: 'Otorgado por', asignado_en: 'Asignado en', otorgado_en: 'Otorgado en',
  propietario_id: 'Propietario', estado_publicacion: 'Estado de publicación', tipo_recurso: 'Tipo de recurso', titulo: 'Título',
  reportante_id: 'Reportante', resuelto_por_id: 'Resuelto por', entidad_tipo: 'Tipo de entidad', entidad_id: 'Entidad',
  motivo: 'Motivo original', estado_reporte: 'Estado de denuncia', fundamento_resolucion: 'Fundamento de resolución',
  medida_aplicada: 'Medida aplicada', reportado_en: 'Reportado en', resuelto_en: 'Resuelto en',
};
