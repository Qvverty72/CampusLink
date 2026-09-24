import { findActiveMapByCampusId } from './map.repository.js';

export function getActiveMap(campusId: string) {
  return findActiveMapByCampusId(campusId);
}
