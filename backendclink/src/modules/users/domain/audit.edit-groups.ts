import type { AuditEntry } from '../types/access.types.js';
import { accessAuditKey } from './audit.access-groups.js';

export const publicationEditPredicate = `accion='EDITAR_PUBLICACION'
  AND entidad_tipo IN ('publicacion_recurso','PUBLICACION_FISICA','PUBLICACION_DIGITAL')
  AND entidad_id ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'`;
export const editAuditKey = `CASE WHEN ${publicationEditPredicate}
  THEN jsonb_build_array('edits',institucion_id,campus_id,lower(entidad_id)) ELSE ${accessAuditKey} END`;

export function isAuditEdit(entry: Pick<AuditEntry,'accion'|'entidad_tipo'|'entidad_id'>) {
  return entry.accion === 'EDITAR_PUBLICACION'
    ? ['publicacion_recurso','PUBLICACION_FISICA','PUBLICACION_DIGITAL'].includes(entry.entidad_tipo)
      && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(entry.entidad_id)
    : ['EDITAR_ACTIVIDAD','EDITAR_EVENTO_OFICIAL'].includes(entry.accion)
      && ['actividad','evento_oficial'].includes(entry.entidad_tipo) && /^[0-9a-f]{24}$/i.test(entry.entidad_id);
}

export function presentAuditEditGroup({ edit_group_count,...entry }: AuditEntry & { edit_group_count?: number }): AuditEntry {
  return { ...entry,...(isAuditEdit(entry) && Number.isSafeInteger(edit_group_count) && edit_group_count! > 1 ? { editGroup:{count:edit_group_count!} } : {}) };
}

function sameValue(before: unknown, after: unknown): boolean {
  if (Object.is(before,after)) return true;
  if (Array.isArray(before) && Array.isArray(after)) return before.length === after.length && before.every((value,index)=>sameValue(value,after[index]));
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object' || Array.isArray(before) || Array.isArray(after)) return false;
  const left = before as Record<string,unknown>, right = after as Record<string,unknown>, keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key=>Object.hasOwn(right,key) && sameValue(left[key],right[key]));
}

/** Recibe snapshots ya sanitizados: resume campos principales, sin transportar valores ni JSON original. */
export function auditEditSummary(before: Record<string,unknown> | null, after: Record<string,unknown> | null): NonNullable<AuditEntry['changes']> {
  if (!before || !after) return {complete:false,fields:[]};
  const fields = [...new Set([...Object.keys(before),...Object.keys(after)])].filter(key=>
    Object.hasOwn(before,key) !== Object.hasOwn(after,key) || !sameValue(before[key],after[key]));
  return {complete:true,fields:[...fields.filter(key=>key !== 'updated_at'),...fields.filter(key=>key === 'updated_at')]};
}
