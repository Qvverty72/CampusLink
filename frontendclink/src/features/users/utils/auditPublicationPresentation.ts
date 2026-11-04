import { auditInformationFields, auditChangedFields } from './auditDetailPresentation';
import type { AuditDetail } from '../types/audit';

export type AuditSide = 'datos_antes' | 'datos_despues';
export const isAuditPublication = (entry: Pick<AuditDetail,'accion'|'entidad_tipo'>) =>
  ['PUBLICAR_PUBLICACION','EDITAR_PUBLICACION','RETIRAR_PUBLICACION'].includes(entry.accion)
  && ['publicacion_recurso','PUBLICACION_FISICA','PUBLICACION_DIGITAL'].includes(entry.entidad_tipo);
export const publicationLabels: Record<string,string> = {
  DISPONIBLE:'Disponible',RESERVADO:'Reservado',ENTREGADO:'Entregado',FINALIZADO:'Finalizado',OCULTO:'Oculto',RETIRADO:'Retirado',
  VENTA:'Venta',DONACION:'Donación',FISICO:'Físico',DIGITAL:'Digital',NUEVO:'Nuevo',COMO_NUEVO:'Como nuevo',BUEN_ESTADO:'Buen estado',USADO:'Usado',REGULAR:'Regular',
};
export const publicationText = (value: unknown) => typeof value === 'string' && value.trim() ? value : null;

/** Una edición lee exclusivamente su lado; la ficha de creación/retirada conserva precedencia por presencia. */
export function auditPublicationFields(entry: AuditDetail, side?: AuditSide) {
  return side ? Object.entries(entry[side] ?? {}).map(([key,value])=>({key,value,path:`${side}.${key}`})) : auditInformationFields(entry);
}

export function auditPublicationPrice(value: unknown, modality: unknown, currency: unknown) {
  if (modality === 'DONACION') return { label:'Donación',raw:null,currency:null };
  const raw = typeof value === 'string' || typeof value === 'number' ? String(value) : null;
  const number = raw?.trim() ? Number(raw) : NaN, code = typeof currency === 'string' && /^[A-Z]{3}$/.test(currency) ? currency : null;
  return { label:Number.isFinite(number) ? code ? new Intl.NumberFormat('es-CL',{style:'currency',currency:code,minimumFractionDigits:0,maximumFractionDigits:2}).format(number) : number.toLocaleString('es-CL') : 'Precio no registrado',raw,currency:code };
}

export function auditPublicationOwner(entry: AuditDetail, id: string | null) {
  if (!id) return null;
  const owner = entry.publicationOwners?.[id.toLowerCase()];
  if (owner) return owner;
  // Compatibilidad con servidor previo: solo el mismo usuario puede reutilizar el perfil del responsable.
  return id.toLowerCase() === entry.actor_usuario_id?.toLowerCase()
    ? { profile:entry.responsibleProfile ?? null,assignments:entry.actor } : null;
}

export function auditPublicationChanges(entry: AuditDetail) {
  const result = auditChangedFields(entry);
  const isUpdateDate = (field: typeof result.fields[number]) => field.path.length === 1 && field.path[0] === 'updated_at';
  // Conserva la comparación de fechas después de los cambios de contenido, sin alterar snapshots.
  return { ...result,fields:[...result.fields.filter(field=>!isUpdateDate(field)),...result.fields.filter(isUpdateDate)] };
}
