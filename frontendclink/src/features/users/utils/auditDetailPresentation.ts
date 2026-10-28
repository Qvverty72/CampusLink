import type { AuditDetail, AuditReference } from '../types/audit';

const comparisonActions = new Set([
  'ASIGNAR_ROL', 'REVOCAR_ROL', 'ASIGNAR_PERMISO', 'REVOCAR_PERMISO',
  'EDITAR_PUBLICACION', 'EDITAR_ACTIVIDAD', 'EDITAR_EVENTO_OFICIAL',
]);

export const usesAuditComparison = (action: string) => comparisonActions.has(action);

export interface AuditFieldChange {
  path: string[];
  kind: 'added' | 'removed' | 'modified';
}

/** Una etiqueta por asignación; los identificadores permanecen en el historial, no como texto de presentación. */
export function auditAssignmentNames(value: unknown[], path: string, references?: Record<string, AuditReference>) {
  const name = (candidate: unknown) => typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
  const kind = path.endsWith('.roles') ? 'role' : 'permission';
  return value.map((item, index) => {
    if (!isRecord(item)) return null;
    const recordedName = name(item.nombre);
    if (recordedName) return recordedName;
    for (const key of ['catalog_id', 'id']) {
      const reference = references?.[`${path}.${index}.${key}`];
      if (reference && reference.id === item[key] && reference.source !== 'unavailable'
        && reference.kind === (key === 'catalog_id' ? kind : 'assignment')) {
        const referenceName = name(reference.name);
        if (referenceName) return referenceName;
      }
    }
    return null;
  });
}

/** Mantiene la ruta de cada lado para resolver nombres/ID sin confundir un campo ausente con null. */
export function auditChangeValue(entry: Pick<AuditDetail, 'datos_antes' | 'datos_despues'>, path: readonly string[], side: 'datos_antes' | 'datos_despues') {
  let value: unknown = entry[side];
  const referencePath = [side, ...path].join('.');
  for (const key of path) {
    if (!isRecord(value) || !Object.hasOwn(value, key)) return { present: false, value: undefined, path: referencePath };
    value = value[key];
  }
  return { present: true, value, path: referencePath };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Compara JSON por contenido; el orden de asignaciones no representa un cambio de acceso. */
function sameValue(before: unknown, after: unknown, unordered = false): boolean {
  if (Object.is(before, after)) return true;
  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length !== after.length) return false;
    if (!unordered) return before.every((value, index) => sameValue(value, after[index]));
    const remaining = [...after];
    return before.every(value => {
      const index = remaining.findIndex(item => sameValue(value, item));
      if (index < 0) return false;
      remaining.splice(index, 1);
      return true;
    });
  }
  if (!isRecord(before) || !isRecord(after)) return false;
  const keys = Object.keys(before);
  return keys.length === Object.keys(after).length && keys.every(key => Object.hasOwn(after, key) && sameValue(before[key], after[key]));
}

/** Resumen de los snapshots originales; nunca infiere diferencias de nombres de referencia actuales. */
export function auditChangedFields(entry: Pick<AuditDetail, 'datos_antes' | 'datos_despues'>) {
  const fields: AuditFieldChange[] = [];
  if (!entry.datos_antes || !entry.datos_despues) return { complete: false, fields };
  function compare(before: Record<string, unknown>, after: Record<string, unknown>, parent: string[] = []) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const path = [...parent, key];
      if (!Object.hasOwn(before, key)) fields.push({ path, kind: 'added' });
      else if (!Object.hasOwn(after, key)) fields.push({ path, kind: 'removed' });
      else if (!sameValue(before[key], after[key], !parent.length && (key === 'roles' || key === 'permissions'))) {
        if (isRecord(before[key]) && isRecord(after[key])) compare(before[key], after[key], path);
        else fields.push({ path, kind: 'modified' });
      }
    }
  }
  compare(entry.datos_antes, entry.datos_despues);
  return { complete: true, fields };
}

/** Una ficha por acción: conserva campos exclusivos del anterior y las rutas de referencia de cada valor. */
export function auditInformationFields(entry: Pick<AuditDetail, 'datos_antes' | 'datos_despues'>) {
  const before = entry.datos_antes ?? {}, after = entry.datos_despues ?? {};
  return Object.keys({ ...before, ...after }).map(key => {
    const source = Object.hasOwn(after, key) ? 'datos_despues' : 'datos_antes';
    return { key, value: source === 'datos_despues' ? after[key] : before[key], path: `${source}.${key}` };
  });
}
