export interface AuditImageRecord {
  id: string | null; name: string | null; mimeType: string | null;
  bytes: number | null; order: number | null; removedAt: string | null;
}

/** Solo metadatos históricos conocidos; una URL o ruta inyectada nunca se usa para cargar imágenes. */
export function auditImageRecords(value: unknown[]): AuditImageRecord[] {
  const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
  const integer = (value: unknown) => {
    const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
  };
  return value.map(item => {
    const row = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {};
    return { id: text(row.id), name: text(row.nombre_original), mimeType: text(row.mime_type),
      bytes: integer(row.tamano_bytes), order: integer(row.orden), removedAt: text(row.deleted_at) };
  });
}

export function auditImageSize(bytes: number) {
  const human = bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toLocaleString('es-CL', { maximumFractionDigits: 2 })} MB`
    : bytes >= 1024 ? `${(bytes / 1024).toLocaleString('es-CL', { maximumFractionDigits: 1 })} KB` : null;
  const exact = `${bytes.toLocaleString('es-CL')} bytes`;
  return human ? `${human} (${exact})` : exact;
}

/** Prioriza principal activa conservada; solo si no hay activas muestra una imagen histórica retirada. */
export function auditPrimaryImage(value: unknown[]) {
  const images = auditImageRecords(value).map((image,index)=>({image,index}));
  const active = images.filter(row=>!row.image.removedAt), candidates = active.length ? active : images;
  return candidates.sort((a,b)=>(a.image.order ?? Number.MAX_SAFE_INTEGER)-(b.image.order ?? Number.MAX_SAFE_INTEGER)||a.index-b.index)[0];
}
