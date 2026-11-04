/** API interna explícita de analytics.
 * Las operaciones SQL transaccionales reciben el PoolClient del caso de uso llamante;
 * no abren otra transacción ni omiten las revalidaciones existentes.
 * Domain y types también son contratos públicos; las demás carpetas son internas.
 */
export { parseResourceOperationId, resourceOperationKey } from './services/analytics.service.js';
export { findResourceRequestOperation } from './repositories/analytics.repository.js';
