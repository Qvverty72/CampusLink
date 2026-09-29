import { findActiveMapByCampusId } from './map.repository.js';

/**
 * Caso de uso para obtener el mapa activo de un campus.
 *
 * Hoy delega directamente porque aún no existen reglas adicionales. Mantener esta
 * capa deja un punto explícito para autorización o validación entre Supabase y
 * MongoDB sin mezclar esas decisiones con HTTP ni con queries.
 */
export function getActiveMap(campusId: string) {
  return findActiveMapByCampusId(campusId);
}
