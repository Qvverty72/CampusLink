import type { AuditEntry, AuditReference, AuditReferenceKind, AuditReferenceName, AuditReferenceRequest } from './access.types.js';

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const name = (value: unknown) => typeof value === 'string' && value.trim() ? value : null;
const entityKind = (type: unknown): AuditReferenceKind | undefined =>
  type === 'perfil_usuario' || type === 'COMPORTAMIENTO' ? 'user'
    : ['publicacion_recurso','PUBLICACION_FISICA','PUBLICACION_DIGITAL'].includes(String(type)) ? 'publication'
      : ['actividad','evento_oficial'].includes(String(type)) ? 'activity' : type === 'reporte_contenido' ? 'report' : undefined;

/** Solo inspecciona campos/arrays de la proyección histórica, nunca JSON arbitrario. */
export function auditReferenceRequests(entry: AuditEntry & { reporte_contenido_id?: string | null }, before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  const requests: AuditReferenceRequest[] = [];
  const add = (path: string, kind: AuditReferenceKind | undefined, id: unknown, recordedName?: unknown) => {
    if (kind && typeof id === 'string' && id) requests.push({ path, kind, id, recordedName: name(recordedName) });
  };
  const targetKind = entityKind(entry.entidad_tipo);
  const targetName = (value: Record<string, unknown> | null) => value?.id === entry.entidad_id
    ? name(targetKind === 'user' ? value.nombre_completo : targetKind === 'publication' || targetKind === 'activity' ? value.titulo : null) : null;
  const historicalTargetName = targetName(after) ?? targetName(before);
  add('actor_usuario_id', 'user', entry.actor_usuario_id, entry.actor_usuario_id === entry.entidad_id && targetKind === 'user' ? historicalTargetName : null);
  add('campus_id', 'campus', entry.campus_id);
  add('institucion_id', 'institution', entry.institucion_id);
  add('entidad_id', targetKind, entry.entidad_id, historicalTargetName);
  add('reporte_contenido_id', 'report', entry.reporte_contenido_id);

  const catalogKind = entry.accion.includes('ROL') ? 'role' : entry.accion.includes('PERMISO') ? 'permission' : undefined;
  function inspect(row: Record<string, unknown>, path: string, kind?: AuditReferenceKind, recordedName?: unknown) {
    add(path + '.id', kind, row.id, recordedName);
    add(path + '.campus_id', 'campus', row.campus_id);
    add(path + '.institucion_id', 'institution', row.institucion_id);
    add(path + '.categoria_id', 'category', row.categoria_id);
    add(path + '.rol_id', 'role', row.rol_id);
    add(path + '.permiso_id', 'permission', row.permiso_id);
    for (const field of ['propietario_id','perfil_usuario_id','asignado_por_id','otorgado_por_id','reportante_id','resuelto_por_id']) {
      add(path + '.' + field, 'user', row[field], row[field] === row.id && kind === 'user' ? recordedName : null);
    }
    add(path + '.entidad_id', entityKind(row.entidad_tipo), row.entidad_id);
  }
  for (const [prefix, snapshot] of [['datos_antes',before],['datos_despues',after]] as const) {
    if (!snapshot) continue;
    inspect(snapshot, prefix, targetKind, targetKind === 'user' ? snapshot.nombre_completo : targetKind === 'publication' || targetKind === 'activity' ? snapshot.titulo : null);
    const assignments = [snapshot.roles,snapshot.permissions].flatMap(value => Array.isArray(value) ? value.filter(record) : []);
    add(prefix + '.assignmentId', 'assignment', snapshot.assignmentId, assignments.find(row => row.id === snapshot.assignmentId)?.nombre);
    add(prefix + '.catalogId', catalogKind, snapshot.catalogId, assignments.find(row => row.catalog_id === snapshot.catalogId)?.nombre);
    for (const [key, kind, nameKey] of [
      ['roles','assignment','nombre'], ['permissions','assignment','nombre'],
      ['publicacion_recurso','publication','titulo'], ['images','file','nombre_original'],
      ['careers','career','name'], ['subjects','subject','name'],
    ] as const) {
      const rows = snapshot[key];
      if (!Array.isArray(rows)) continue;
      rows.forEach((row: unknown, index) => {
        if (!record(row)) return;
        const path = prefix + '.' + key + '.' + index;
        inspect(row,path,kind,row[nameKey]);
        if (key === 'roles' || key === 'permissions') add(path + '.catalog_id', key === 'roles' ? 'role' : 'permission', row.catalog_id, row.nombre);
      });
    }
  }
  return requests;
}

/** Un nombre vigente complementa el ID; nunca modifica los valores del snapshot. */
export function auditReferences(requests: AuditReferenceRequest[], current: AuditReferenceName[]): Record<string, AuditReference> {
  const names = new Map(current.map(row => [row.kind + ':' + row.id.toLowerCase(), row.name]));
  return Object.fromEntries(requests.map(request => {
    const currentName = name(names.get(request.kind + ':' + request.id.toLowerCase()));
    return [request.path, { kind: request.kind, id: request.id, name: request.recordedName ?? currentName,
      source: request.recordedName !== null ? 'recorded' : currentName !== null ? 'current' : 'unavailable' }];
  }));
}
