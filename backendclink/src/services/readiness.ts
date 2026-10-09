import { getAnalyticsHealth } from '../modules/analytics/analytics.service.js';
import { getAuthHealth } from '../modules/auth/auth.service.js';
import { getMapHealth } from '../modules/maps/map.service.js';
import { getElibraryHealth } from '../modules/marketplace/elibrary/elibrary.service.js';
import { getPhysicalgoodsHealth } from '../modules/marketplace/physicalgoods/physicalgoods.service.js';
import { getReportsHealth } from '../modules/reports/reports.service.js';
import { getUsersHealth } from '../modules/users/users.service.js';
import type { ApiReadiness } from '../types/api.types.js';

export async function getReadiness(): Promise<ApiReadiness> {
  const modules = await Promise.all([
    getUsersHealth(), getAuthHealth(), getMapHealth(), getPhysicalgoodsHealth(),
    getElibraryHealth(), getReportsHealth(), getAnalyticsHealth(),
  ]);
  return { status: modules.every(module => module.status === 'ok') ? 'ok' : 'unavailable', modules };
}
