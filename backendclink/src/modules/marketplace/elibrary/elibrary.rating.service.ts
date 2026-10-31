import { ApiError } from '../../../shared/errors/api-error.js';
import type { VerifiedAuthConnection } from '../../auth/types/auth.types.js';
import { assertMarketplaceRatingEligible,parseMarketplaceRating } from '../marketplace.rating.js';
import { digitalId } from './elibrary.validation.js';
import { withDigitalTradeContext } from './elibrary.trades.service.js';
import { findDigitalTrade } from './elibrary.trades.repository.js';
import { findDigitalRating,insertDigitalRating } from './elibrary.rating.repository.js';
export async function rateDigitalOwner(auth:VerifiedAuthConnection,id:unknown,rawTrade:unknown,raw:unknown) {
  const score=parseMarketplaceRating(raw),tradeId=digitalId(rawTrade,'transactionId');
  return withDigitalTradeContext(auth,id,async(client,resource,current)=>{
    const trade=await findDigitalTrade(client,resource.id,tradeId);if(!trade)throw new ApiError(404,'NOT_FOUND','No se encontró el acuerdo.');
    assertMarketplaceRatingEligible(current.userId,trade.propietario_id,trade.receptor_id,trade.estado_transaccion);
    if(await findDigitalRating(client,trade.id))throw new ApiError(409,'CONFLICT','Esta transacción ya tiene una valoración. No se puede editar.');
    const rating=await insertDigitalRating(client,trade.id,current.userId,trade.propietario_id,score);return {...rating,createdAt:new Date(rating.createdAt).toISOString()};
  },{tradeId});
}
