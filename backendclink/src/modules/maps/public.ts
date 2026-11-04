/** API interna explícita de maps.
 * Las operaciones SQL transaccionales reciben el PoolClient del caso de uso llamante;
 * no abren otra transacción ni omiten las revalidaciones existentes.
 * Domain y types también son contratos públicos; las demás carpetas son internas.
 */
export { getAuthorizedActiveMap } from './services/map.service.js';
export type { ActiveMapLookup } from './services/map.service.js';
export { findActiveMapByCampusId } from './repositories/map.repository.js';
