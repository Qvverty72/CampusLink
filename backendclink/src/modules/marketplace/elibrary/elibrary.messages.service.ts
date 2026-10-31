import type { VerifiedAuthConnection } from '../../auth/types/auth.types.js';
import { ApiError } from '../../../shared/errors/api-error.js';
import { createPaginatedResult } from '../../../shared/pagination/pagination.js';
import { digitalAction, digitalHistoryPage, withDigitalTradeContext } from './elibrary.trades.service.js';
import { digitalId, invalidDigital } from './elibrary.validation.js';
import { digitalMembersEnabled, findDigitalTrade } from './elibrary.trades.repository.js';
import { findResourceMessage, insertResourceCoordination, resourceCoordinationMessages, type ResourceMessageRow } from '../marketplace.messages.repository.js';
import type { DigitalTradeRow } from './elibrary.types.js';

const messageDto = (row: ResourceMessageRow, trade: DigitalTradeRow) => ({
  id: row.id, text: row.mensaje, createdAt: row.created_at,
  senderId: row.destinatario_id === trade.propietario_id ? trade.receptor_id : trade.propietario_id,
});
export async function getDigitalMessages(auth: VerifiedAuthConnection, id: unknown, rawTrade: unknown, query: unknown) {
  const tradeId = digitalId(rawTrade, 'transactionId'), page = digitalHistoryPage(query);
  return withDigitalTradeContext(auth, id, async (client, resource) => {
    const trade = await findDigitalTrade(client, resource.id, tradeId);
    if (!trade) throw new ApiError(404, 'NOT_FOUND', 'No se encontró la transacción.');
    const result = createPaginatedResult(await resourceCoordinationMessages(client, resource.id, trade.id,
      [trade.propietario_id, trade.receptor_id], page), page);
    return { ...result, data: result.data.map(row => messageDto(row, trade)) };
  }, { tradeId });
}
export async function sendDigitalMessage(auth: VerifiedAuthConnection, id: unknown, rawTrade: unknown, raw: unknown) {
  const body = digitalAction(raw, ['text', 'messageId']), tradeId = digitalId(rawTrade, 'transactionId');
  const messageId = digitalId(body.messageId, 'messageId');
  if (typeof body.text !== 'string' || !body.text.trim() || body.text.trim().length > 2000
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body.text)) {
    invalidDigital('text', 'Escribe un mensaje de hasta 2000 caracteres.');
  }
  const text = body.text.trim();
  return withDigitalTradeContext(auth, id, async (client, resource, current) => {
    const trade = await findDigitalTrade(client, resource.id, tradeId);
    if (!trade) throw new ApiError(404, 'NOT_FOUND', 'No se encontró la transacción.');
    const recipient = current.userId === trade.propietario_id ? trade.receptor_id : trade.propietario_id;
    const previous = await findResourceMessage(client, messageId);
    if (previous) {
      if (previous.publicacion_id !== resource.id || previous.transaccion_id !== trade.id
        || previous.destinatario_id !== recipient || previous.mensaje !== text) {
        throw new ApiError(409, 'CONFLICT', 'La clave del mensaje ya corresponde a otro envío.');
      }
      return messageDto(previous, trade);
    }
    if (!['RESERVADA', 'PENDIENTE_CONFIRMACION'].includes(trade.estado_transaccion)) {
      throw new ApiError(409, 'CONFLICT', 'La transacción está cerrada. Puedes consultar su conversación.');
    }
    if (!await digitalMembersEnabled(client, [trade.propietario_id, trade.receptor_id], resource.institucion_id)) {
      throw new ApiError(409, 'CONFLICT', 'Los participantes deben estar habilitados en la misma institución.');
    }
    return messageDto(await insertResourceCoordination(client, resource.id, trade.id, recipient, text, messageId), trade);
  }, { tradeId });
}
