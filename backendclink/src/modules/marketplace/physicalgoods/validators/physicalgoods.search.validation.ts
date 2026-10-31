import { ApiError } from '../../../../shared/errors/api-error.js';
import { parsePaginationQuery } from '../../../../shared/pagination/pagination.js';
import type { PhysicalgoodsCondition, PhysicalgoodsSearchFilters } from '../types/physicalgoods.types.js';
import { physicalgoodsId } from './physicalgoods.validation.js';

const invalid = (field: string, message: string): never => {
  throw new ApiError(400, 'VALIDATION_ERROR', message, { details: [{ field, message }] });
};
/** Valida filtros y paginación de búsqueda; limita precio a ventas y normaliza el texto. */
export function parsePhysicalgoodsSearch(query: unknown) {
  const pagination = parsePaginationQuery(query);
  if (!pagination.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Revisa la paginación.', { details: pagination.issues });
  const values = query as Record<string, unknown>;
  if (Object.keys(values).some(key => !['q', 'categoryId', 'modality', 'condition', 'careerId', 'subjectId', 'minPrice', 'maxPrice', 'mine', 'page', 'limit'].includes(key))) invalid('query', 'La búsqueda contiene filtros no admitidos.');
  if (values.q !== undefined && (typeof values.q !== 'string' || values.q.length > 200 || /[\u0000-\u001f\u007f]/.test(values.q))) invalid('q', 'Busca con un texto de máximo 200 caracteres.');
  const q = typeof values.q === 'string' ? values.q.trim().replace(/\s+/g, ' ') : '';
  const id = (field: string) => values[field] === undefined ? null : physicalgoodsId(values[field], field);
  const modality = values.modality;
  if (modality !== undefined && modality !== 'VENTA' && modality !== 'DONACION') invalid('modality', 'Selecciona venta o donación.');
  const condition = values.condition;
  if (condition !== undefined && (typeof condition !== 'string' || !['NUEVO', 'BUEN_ESTADO', 'USADO', 'DETERIORADO'].includes(condition))) invalid('condition', 'Selecciona una condición válida.');
  if (values.mine !== undefined && values.mine !== 'true') invalid('mine', 'Revisa el filtro de publicaciones propias.');
  const price = (field: string) => {
    const value = values[field];
    if (value === undefined) return null;
    if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value)) || Number(value) > Number.MAX_SAFE_INTEGER) return invalid(field, 'Ingresa un precio de filtro válido, mayor o igual que cero.');
    return Number(value);
  };
  const minPrice = price('minPrice'), maxPrice = price('maxPrice');
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) invalid('maxPrice', 'El precio máximo debe ser mayor o igual que el mínimo.');
  if (modality === 'DONACION' && (minPrice !== null || maxPrice !== null)) invalid('modality', 'Los filtros de precio solo corresponden a ventas.');
  const filters: PhysicalgoodsSearchFilters = { q, categoryId: id('categoryId'), modality: modality as PhysicalgoodsSearchFilters['modality'] ?? null,
    condition: condition as PhysicalgoodsCondition | undefined ?? null, careerId: id('careerId'), subjectId: id('subjectId'), minPrice, maxPrice, mine: values.mine === 'true' };
  return { filters, pagination: pagination.data };
}
