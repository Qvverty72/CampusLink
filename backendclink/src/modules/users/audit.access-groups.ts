import type { AuditAccessGroup, AuditEntry } from './access.types.js';

export const ACCESS_AUDIT_ACTIONS = ['ASIGNAR_ROL', 'REVOCAR_ROL', 'ASIGNAR_PERMISO', 'REVOCAR_PERMISO'] as const;

// Fragmentos SQL constantes, nunca interpolados desde parámetros del cliente.
export const accessAuditPredicate = `accion IN ('ASIGNAR_ROL','REVOCAR_ROL','ASIGNAR_PERMISO','REVOCAR_PERMISO')
  AND entidad_tipo='perfil_usuario' AND actor_usuario_id IS NOT NULL
  AND jsonb_typeof(datos_antes->'roles')='array' AND jsonb_typeof(datos_antes->'permissions')='array'
  AND jsonb_typeof(datos_despues->'roles')='array' AND jsonb_typeof(datos_despues->'permissions')='array'`;
export const accessAuditMetadata = `ARRAY['assignmentId','catalogId','action']::text[]`;
export const accessAuditKey = `CASE WHEN ${accessAuditPredicate}
  THEN jsonb_build_array('access',institucion_id,campus_id,actor_usuario_id,entidad_tipo,entidad_id,created_at,
    datos_antes-${accessAuditMetadata},datos_despues-${accessAuditMetadata})
  ELSE jsonb_build_array('single',id) END`;

export function auditAccessGroup(actions: readonly string[], recordIds?: string[]): AuditAccessGroup | undefined {
  if (actions.length < 2 || actions.some(action => !(ACCESS_AUDIT_ACTIONS as readonly string[]).includes(action))) return undefined;
  return { count: actions.length, actions: ACCESS_AUDIT_ACTIONS.map(action => ({ action, count: actions.filter(value => value === action).length })).filter(row => row.count > 0),
    ...(recordIds ? { recordIds } : {}) };
}

/** La consulta agrupa antes de paginar; no exponer el array SQL interno en el contrato público. */
export function presentAuditAccessGroup({ access_group_actions, ...entry }: AuditEntry & { access_group_actions?: string[] }): AuditEntry {
  const group = auditAccessGroup(access_group_actions ?? []);
  return { ...entry, ...(group ? { accessGroup: group } : {}) };
}
