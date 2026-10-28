import { ACTIVITY_REPORT_REASONS } from '@/features/activities/types/activityReport';
import { reviewLabels } from '@/features/reports/types/review';
import type { AuditDetail } from '../types/audit';

export const isAuditReportResolution = (action: string) => ['RESOLVER_DENUNCIA','DESESTIMAR_DENUNCIA'].includes(action);
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value : null;
const reasonTitles: Record<string,string> = {
  ACTIVITY_SPAM: 'Denuncia por spam', ACTIVITY_FALSE_INFORMATION: 'Denuncia por información falsa',
  ACTIVITY_HARASSMENT: 'Denuncia por acoso', ACTIVITY_HATE_DISCRIMINATION: 'Denuncia por discriminación',
  ACTIVITY_INAPPROPRIATE_CONTENT: 'Denuncia por contenido inapropiado', ACTIVITY_DANGEROUS: 'Denuncia por actividad peligrosa',
};

export function auditReportDuration(reportedAt: string | null, resolvedAt: string | null) {
  if (!reportedAt || !resolvedAt) return null;
  const elapsed = Date.parse(resolvedAt)-Date.parse(reportedAt);
  if (!Number.isFinite(elapsed) || elapsed < 0) return null;
  const minutes = Math.floor(elapsed/60000), hours = Math.floor(minutes/60);
  return hours ? `${hours} h${minutes%60 ? ` ${minutes%60} min` : ''}` : minutes ? `${minutes} min` : 'Menos de 1 min';
}

/** Selecciona únicamente datos de la auditoría; null posterior no recupera un valor antiguo. */
export function auditReportPresentation(entry: AuditDetail, campusName?: string) {
  const field = (key: string) => {
    for (const side of ['datos_despues','datos_antes'] as const) {
      const row = entry[side];
      if (row && Object.hasOwn(row,key)) return { value: text(row[key]), path: `${side}.${key}`, present: true };
    }
    return { value: null, path: '', present: false };
  };
  const name = (path: string, id: string | null, kind: string) => {
    const reference = entry.references?.[path];
    return id && reference?.id === id && reference.kind === kind && reference.source !== 'unavailable' ? text(reference.name) : null;
  };
  const person = (key: string, fallbackActor = false) => {
    const item = field(key), id = item.present ? item.value : fallbackActor ? entry.actor_usuario_id : null;
    return { id, name: name(item.path,id,'user') ?? (fallbackActor && id && id === entry.actor_usuario_id
      ? text(entry.responsibleProfile?.fullName) ?? text(entry.actor?.name) ?? name('actor_usuario_id',id,'user') : null) };
  };
  const reportId = entry.reporte_contenido_id ?? (entry.entidad_tipo === 'reporte_contenido' ? entry.entidad_id : null);
  const campusField = field('campus_id'), campusId = campusField.present ? campusField.value : entry.campus_id;
  const campusLabel = name(campusField.path,campusId,'campus') ?? (campusId === entry.campus_id ? text(campusName) ?? name('campus_id',campusId,'campus') : null);
  const typeField = field('entidad_tipo'), targetType = typeField.present ? typeField.value : entry.entidad_tipo !== 'reporte_contenido' ? entry.entidad_tipo : null;
  const targetField = field('entidad_id'), targetId = targetField.present ? targetField.value : entry.entidad_tipo !== 'reporte_contenido' ? entry.entidad_id : null;
  const targetKind = targetType && ['PUBLICACION_FISICA','PUBLICACION_DIGITAL','publicacion_recurso'].includes(targetType) ? 'publication'
    : targetType && ['ACTIVIDAD','actividad','evento_oficial'].includes(targetType) ? 'activity' : targetType === 'COMPORTAMIENTO' ? 'user' : null;
  const targetName = targetKind ? name(targetField.path,targetId,targetKind) ?? (!targetField.present ? name('entidad_id',targetId,targetKind) : null) : null;
  const reason = field('motivo').value, status = field('estado_reporte').value, reportedAt = field('reportado_en').value, resolvedAt = field('resuelto_en').value;
  const reasonLabel = ACTIVITY_REPORT_REASONS.find(option=>option.code === reason)?.label ?? reason;
  const final = status === 'RESUELTO' || status === 'DESESTIMADO';
  const justification = field('fundamento_resolucion');
  const measure = field('medida_aplicada').value;
  return {
    title: reason && reasonTitles[reason] ? reasonTitles[reason] : reason && /^spam\b/i.test(reason) ? 'Denuncia por spam' : 'Detalle de la denuncia',
    report: { id: reportId, name: name('reporte_contenido_id',reportId,'report') ?? name('entidad_id',reportId,'report') },
    campus: { id: campusId, name: campusLabel },
    target: { id: targetId, name: targetName, type: targetType, label: targetType ? reviewLabels[targetType] ?? (targetType === 'publicacion_recurso' ? 'Publicación' : targetType === 'evento_oficial' ? 'Evento oficial' : targetType === 'actividad' ? 'Actividad' : targetType) : 'Tipo no registrado',
      idLabel: targetKind === 'activity' ? 'ID de actividad' : targetKind === 'publication' ? 'ID de publicación' : targetType === 'TRANSACCION' ? 'ID de transacción' : targetKind === 'user' ? 'ID de usuario' : 'ID de contenido',
      status: field('estado_publicacion').value },
    reason: reasonLabel, reasonCode: reason !== reasonLabel ? reason : null,
    measure: measure ? ({ NINGUNA: 'Ninguna', OCULTAR: 'Ocultar contenido', OCULTAR_PUBLICACION: 'Ocultar publicación' } as Record<string,string>)[measure] ?? measure : 'Sin medida registrada',
    status, statusLabel: status ? reviewLabels[status] ?? status : 'Sin estado registrado', final,
    reportedAt, resolvedAt, duration: auditReportDuration(reportedAt,resolvedAt),
    description: field('descripcion').value, justification: justification.present ? justification.value : text(entry.justificacion_accion),
    reporter: person('reportante_id'), resolver: person('resuelto_por_id',true),
  };
}
