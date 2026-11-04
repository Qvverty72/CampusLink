/** API interna explícita de marketplace/elibrary.
 * Las operaciones SQL transaccionales reciben el PoolClient del caso de uso llamante;
 * no abren otra transacción ni omiten las revalidaciones existentes.
 * Domain y types también son contratos públicos; las demás carpetas son internas.
 */
export { digitalId } from './validators/elibrary.validation.js';
export { digitalConfirmations, findDigitalTrade } from './repositories/elibrary.trades.repository.js';
export { withDigitalTradeContext } from './services/elibrary.trades.service.js';
export { DIGITAL_ACCESS_PROOF, downloadDigitalOriginal, findDigitalPublications, findDigitalResource } from './repositories/elibrary.repository.js';
export { assertStoredDigitalFile } from './services/elibrary.files.service.js';
export { activityCounts } from './repositories/elibrary.activity.repository.js';
