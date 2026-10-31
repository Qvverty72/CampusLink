import type { CampusMapDocument } from '../../maps/map.types.js';
import type { AuditReference } from '../types/access.types.js';

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const rows = (value: unknown) => Array.isArray(value) ? value.filter(record) : [];
const unique = (values: Record<string, unknown>[], field: string, id: unknown) => {
  const matches = typeof id === 'string' && id ? values.filter(value => value[field] === id) : [];
  return matches.length === 1 ? matches[0] : undefined;
};
const name = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;

/** Solo complementa ubicaciones del campus autorizado; una clave local nunca se resuelve sin sus padres. */
export function auditLocationReferences(campusId: string, before: Record<string, unknown> | null,
  after: Record<string, unknown> | null, map: CampusMapDocument | null): Record<string, AuditReference> {
  const references: Record<string, AuditReference> = {};
  const buildings = map?.campusId === campusId && map.status === 'ACTIVE' ? rows(map.buildings) : [];
  for (const [prefix, snapshot] of [['datos_antes', before], ['datos_despues', after]] as const) {
    if (!snapshot || !record(snapshot.ubicacion)) continue;
    const location = snapshot.ubicacion;
    const building = snapshot.campus_id === campusId ? unique(buildings, 'id', location.edificio_clave) : undefined;
    const floor = unique(rows(building?.floors), 'id', location.piso_clave);
    const poi = unique(rows(floor?.pois), 'poiKey', location.poi_clave);
    for (const [key, kind, value] of [['edificio_clave', 'building', building], ['piso_clave', 'floor', floor], ['poi_clave', 'poi', poi]] as const) {
      const id = location[key];
      if (typeof id !== 'string' || !id) continue;
      const currentName = name(value?.name);
      references[`${prefix}.ubicacion.${key}`] = { kind, id, name: currentName, source: currentName ? 'current' : 'unavailable' };
    }
  }
  return references;
}
