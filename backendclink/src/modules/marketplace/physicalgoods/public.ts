/** API interna explícita de marketplace/physicalgoods.
 * Las operaciones SQL transaccionales reciben el PoolClient del caso de uso llamante;
 * no abren otra transacción ni omiten las revalidaciones existentes.
 * Domain y types también son contratos públicos; las demás carpetas son internas.
 */
export { PHYSICALGOODS_BUCKET, lockPhysicalgoodsPublisher, signPrincipalPhoto, withPhysicalgoodsTransaction } from './repositories/physicalgoods.repository.js';
export { findPhysicalgoodsMedia } from './repositories/physicalgoods.images.repository.js';
export { physicalgoodsSnapshot } from './repositories/physicalgoods.history.repository.js';
export { countOwnPhysicalgoodsTransactions, findPhysicalgoodsTransaction, lockPhysicalgoodsTransactionResource, physicalgoodsConfirmations, physicalgoodsTransactionDetail } from './repositories/physicalgoods.transactions.repository.js';
export { physicalgoodsId } from './validators/physicalgoods.validation.js';
export { withPhysicalgoodsHistory } from './services/physicalgoods.history.service.js';
export { countPhysicalgoodsRequests } from './repositories/physicalgoods.requests.repository.js';
