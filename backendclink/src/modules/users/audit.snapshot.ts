// Public historical fields only. Never forward arbitrary stored JSON or join live data.
const fields = ['id','institucion_id','campus_id','nombre_completo','estado_cuenta','deleted_at','updated_at',
  'assignmentId','catalogId','action','perfil_usuario_id','rol_id','permiso_id','revocado_en',
  'asignado_por_id','otorgado_por_id','asignado_en','otorgado_en',
  'propietario_id','estado_publicacion','tipo_recurso','titulo',
  'reportante_id','resuelto_por_id','entidad_tipo','entidad_id','motivo','estado_reporte',
  'fundamento_resolucion','medida_aplicada','reportado_en','resuelto_en'];
const assignmentFields = ['id','catalog_id','nombre','campus_id'];
const publicationFields = ['id','campus_id','propietario_id','estado_publicacion','deleted_at','updated_at'];

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function pick(value: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.filter(key => Object.hasOwn(value,key)
    && (value[key] === null || ['string','number','boolean'].includes(typeof value[key])))
    .map(key => [key,value[key]]));
}
export function auditSnapshot(value: unknown): Record<string, unknown> | null {
  if (!record(value)) return null;
  const result = pick(value,fields);
  for (const [key,keys] of [['roles',assignmentFields],['permissions',assignmentFields],['publicacion_recurso',publicationFields]] as const) {
    if (Array.isArray(value[key])) result[key] = value[key].filter(record).map(row => pick(row,keys));
  }
  return result;
}
