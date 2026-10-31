/** API interna explícita de activities.
 * Las operaciones SQL transaccionales reciben el PoolClient del caso de uso llamante;
 * no abren otra transacción ni omiten las revalidaciones existentes.
 * Domain y types también son contratos públicos; las demás carpetas son internas.
 */
export { parseActivityId, parseEmptyActivityInput } from './validators/activities.validation.js';
export { hideReportedActivity } from './repositories/activities.management.repository.js';
export { findVisibleActivity } from './repositories/activities.detail.repository.js';
export { validActivityCreators } from './services/activities.references.service.js';
export type { ActivityDependencies } from './services/activities.service.js';
