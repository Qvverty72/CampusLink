/** API interna explícita de users.
 * Las operaciones SQL transaccionales reciben el PoolClient del caso de uso llamante;
 * no abren otra transacción ni omiten las revalidaciones existentes.
 * Domain y types también son contratos públicos; las demás carpetas son internas.
 */
export { deliverActivityNotification } from './repositories/notifications.repository.js';
export { accessRepository } from './repositories/access.repository.js';
