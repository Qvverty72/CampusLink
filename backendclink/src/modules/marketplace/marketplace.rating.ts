import { ApiError } from '../../services/api-response.js';
/** Regla única para valoraciones físicas y digitales, sin dependencia de su persistencia o campus. */
export function parseMarketplaceRating(body:unknown):number {
  const invalid=(field:string,message:string):never=>{throw new ApiError(400,'VALIDATION_ERROR',message,{details:[{field,message}]});};
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>key!=='score'))return invalid('body','Selecciona una puntuación de 1 a 5.');
  const score=(body as Record<string,unknown>).score;
  if(typeof score!=='number'||!Number.isInteger(score)||score<1||score>5)return invalid('score','La puntuación debe ser un entero de 1 a 5.');
  return score;
}
export function assertMarketplaceRatingEligible(actor:string,owner:string,receiver:string,status:string) {
  if(actor!==receiver||actor===owner)throw new ApiError(403,'FORBIDDEN','Solo el comprador o receptor puede valorar al propietario.');
  if(status!=='COMPLETADA')throw new ApiError(409,'CONFLICT','Completa el intercambio antes de valorar al propietario.');
}
