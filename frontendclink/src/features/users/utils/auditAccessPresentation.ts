import { auditLabels, type AuditEntry } from '../types/audit';

const actions: Record<string, { title: string; one: string; many: string }> = {
  ASIGNAR_ROL: { title: 'Asignación de roles', one: 'rol asignado', many: 'roles asignados' },
  REVOCAR_ROL: { title: 'Revocación de roles', one: 'rol revocado', many: 'roles revocados' },
  ASIGNAR_PERMISO: { title: 'Asignación de permisos', one: 'permiso asignado', many: 'permisos asignados' },
  REVOCAR_PERMISO: { title: 'Revocación de permisos', one: 'permiso revocado', many: 'permisos revocados' },
};

export function auditEntryTitle(entry: Pick<AuditEntry, 'accion' | 'accessGroup' | 'activitySeries' | 'editGroup'>) {
  if (entry.editGroup && entry.editGroup.count > 1) return entry.accion === 'EDITAR_PUBLICACION' ? 'Ediciones de la publicación'
    : entry.accion === 'EDITAR_EVENTO_OFICIAL' ? 'Ediciones del evento oficial' : 'Ediciones de la actividad';
  if (entry.activitySeries) return entry.accion === 'PUBLICAR_EVENTO_OFICIAL' ? 'Serie de eventos oficiales publicada' : 'Serie de actividades publicada';
  const group = entry.accessGroup;
  if (!group || group.count < 2 || !group.actions.length) return auditLabels[entry.accion] ?? entry.accion;
  if (group.actions.length === 1) return actions[group.actions[0].action]?.title ?? auditLabels[entry.accion] ?? entry.accion;
  const roles = group.actions.some(row => row.action.endsWith('ROL'));
  const permissions = group.actions.some(row => row.action.endsWith('PERMISO'));
  return roles && permissions ? 'Actualización de roles y permisos' : roles ? 'Actualización de roles' : 'Actualización de permisos';
}

export function auditAccessSummary(group: NonNullable<AuditEntry['accessGroup']>) {
  return group.actions.map(row => {
    const label = actions[row.action];
    return `${row.count} ${label ? row.count === 1 ? label.one : label.many : 'acciones'}`;
  }).join(' · ');
}
