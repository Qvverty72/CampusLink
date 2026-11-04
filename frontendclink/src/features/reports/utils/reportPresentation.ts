import { ACTIVITY_REPORT_REASONS } from '@/features/activities/types/activityReport';
import { reviewLabels } from '../types/review';
import type { ReportReviewSummary } from '../types/review';

export const reportReason = (reason?: string | null) => ACTIVITY_REPORT_REASONS.find(row => row.code === reason)?.label ?? reason ?? 'Motivo no registrado';
export const reportType = (type?: string) => type === 'TRANSACCION' ? 'Intercambio' : reviewLabels[type ?? ''] ?? type ?? 'Contenido';
export const reportTitle = (title?: string | null) => title?.trim() || 'Contenido sin título registrado';
export function reportDate(value?: string | null) {
  return value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    : 'Fecha no registrada';
}

/** Antigüedad del envío o fecha original de la decisión, según el estado del caso. */
export function reportCardDate(entry: Pick<ReportReviewSummary, 'status' | 'reportedAt' | 'resolution'>, now = Date.now()) {
  const final = entry.status === 'RESUELTO' || entry.status === 'DESESTIMADO';
  const value = final ? entry.resolution?.resolvedAt : entry.reportedAt;
  if (!value || !Number.isFinite(Date.parse(value))) return final ? 'Fecha de decisión no registrada' : 'Fecha no registrada';
  const date = new Date(value);
  const short = date.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', ...(date.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) });
  if (final) return `${entry.status === 'RESUELTO' ? 'resuelta' : 'desestimada'} el ${short}`;
  const minutes = Math.floor((now - date.getTime()) / 60000);
  if (minutes < 0) return short;
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  if (minutes < 1440) return `hace ${Math.floor(minutes / 60)} h`;
  const days = Math.floor(minutes / 1440);
  return days < 7 ? `hace ${days} ${days === 1 ? 'día' : 'días'}` : short;
}
export const reportBytes = (bytes: number) => bytes < 1024 ? `${bytes.toLocaleString('es-CL')} B`
  : `${(bytes / (bytes < 1048576 ? 1024 : 1048576)).toLocaleString('es-CL', { maximumFractionDigits: 1 })} ${bytes < 1048576 ? 'KB' : 'MB'}`;

/** Whitelist de presentación; nunca se vuelca JSON ni rutas de Storage. */
export const evidenceLabels: Record<string, string> = {
  publication: 'Publicación', transaction: 'Intercambio', confirmations: 'Confirmaciones',
  titulo: 'Título', title: 'Título', descripcion: 'Descripción', description: 'Descripción',
  tipo_recurso: 'Tipo de recurso', modalidad: 'Modalidad', modality: 'Modalidad', precio: 'Precio',
  moneda: 'Moneda', currency: 'Moneda', estado_publicacion: 'Estado de publicación', status: 'Estado',
  estado_transaccion: 'Estado del acuerdo', monto_acordado: 'Monto acordado', amount: 'Monto',
  modalidad_acordada: 'Modalidad acordada', propietario_id: 'ID de propietario', receptor_id: 'ID de receptor',
  propietario_nombre: 'Propietario', receptor_nombre: 'Receptor', owner: 'Propietario', receiver: 'Receptor',
  name: 'Nombre', nombre_original: 'Nombre del archivo', id: 'ID', publicacion_id: 'ID de publicación',
  solicitud_id: 'ID de solicitud', campus_id: 'ID de campus', campus_nombre: 'Campus',
  iniciada_en: 'Inicio del acuerdo', completada_en: 'Completado', cancelada_en: 'Cancelado',
  startedAt: 'Inicio', completedAt: 'Completado', cancelledAt: 'Cancelado', deletedAt: 'Retirada', deleted_at: 'Retirada',
  createdAt: 'Creación', updatedAt: 'Último cambio', updated_at: 'Último cambio', startAt: 'Inicio', endAt: 'Término',
  type: 'Tipo', visibility: 'Visibilidad', revision: 'Revisión', createdByUserId: 'ID de organizador',
  location: 'Ubicación', buildingName: 'Edificio', floorName: 'Piso', poiName: 'Punto de interés',
  buildingKey: 'Referencia de edificio', floorKey: 'Referencia de piso', poiKey: 'Referencia de punto',
  category: 'Categoría', tags: 'Etiquetas', series: 'Serie', index: 'Ocurrencia', count: 'Cantidad',
  careers: 'Carreras', subjects: 'Asignaturas', code: 'Código', files: 'Archivos', images: 'Imágenes registradas',
  mimeType: 'Formato', mime_type: 'Formato', sizeBytes: 'Tamaño', tamano_bytes: 'Tamaño',
  estado_uso: 'Estado de uso', categoria_id: 'ID de categoría', orden: 'Orden', rol_confirmante: 'Rol que confirma',
  usuario_id: 'ID de usuario', userId: 'ID de usuario', role: 'Rol', confirmado_en: 'Confirmado', confirmedAt: 'Confirmado',
  cancelada_por_id: 'ID de quien canceló', motivo_cancelacion: 'Motivo de cancelación',
};
const values: Record<string, string> = { ...reviewLabels, FISICO: 'Físico', DIGITAL: 'Digital', VENTA: 'Venta', DONACION: 'Donación',
  DISPONIBLE: 'Disponible', RESERVADO: 'Reservado', FINALIZADO: 'Finalizado', OCULTO: 'Oculto', RETIRADO: 'Retirado', CANCELADO: 'Cancelado',
  COMPLETADA: 'Completado', CANCELADA: 'Cancelado', RESERVADA: 'Reservado', PENDIENTE_CONFIRMACION: 'Pendiente de confirmación',
  COMMUNITY_ACTIVITY: 'Actividad comunitaria', OFFICIAL_EVENT: 'Evento oficial', PUBLIC: 'Público', HIDDEN: 'Oculto', ACTIVE: 'Activa', FINISHED: 'Finalizada',
  PROPIETARIO: 'Propietario', RECEPTOR: 'Receptor' };
export const isEvidenceReference = (key: string) => key === 'id' || key.endsWith('_id') || key.endsWith('Id') || key.endsWith('Key') || key === 'revision' || key === 'code';
export const isEvidenceDate = (key: string) => /At$|_en$|_at$/.test(key);
export function evidenceValue(key: string, value: string | number | boolean, parent: Record<string, unknown> = {}) {
  if (typeof value === 'number') {
    if (key === 'sizeBytes' || key === 'tamano_bytes') return reportBytes(value);
    const currency = parent.moneda ?? parent.currency;
    if (['precio', 'monto_acordado', 'amount'].includes(key) && typeof currency === 'string' && /^[A-Z]{3}$/.test(currency)) {
      try { return new Intl.NumberFormat('es-CL', { style: 'currency', currency }).format(value); } catch { /* Formato legado: conservar número. */ }
    }
    return value.toLocaleString('es-CL');
  }
  if (isEvidenceDate(key) && typeof value === 'string') return Number.isFinite(Date.parse(value)) ? reportDate(value) : value;
  return values[String(value)] ?? (value === true ? 'Sí' : value === false ? 'No' : String(value));
}
