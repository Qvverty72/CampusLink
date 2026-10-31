/** API interna explícita de marketplace.
 * Las operaciones SQL transaccionales reciben el PoolClient del caso de uso llamante;
 * no abren otra transacción ni omiten las revalidaciones existentes.
 * Domain y types también son contratos públicos; las demás carpetas son internas.
 */
export { notifyResourceRequest, notifyResourceUpdated } from './repositories/marketplace.notifications.js';
export { findOwnerRatings } from './repositories/marketplace.ratings.repository.js';
export { findResourceMessage, insertResourceCoordination, resourceCoordinationMessages } from './repositories/marketplace.messages.repository.js';
export type { ResourceMessageRow } from './repositories/marketplace.messages.repository.js';
export type { OwnerRatingSummary } from './repositories/marketplace.ratings.repository.js';
