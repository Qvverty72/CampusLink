import { createModuleHealthCheck } from '../../../services/module-health.js';
import { probePhysicalgoodsDependencies } from './physicalgoods.repository.js';
import type { PhysicalgoodsHealth } from './physicalgoods.types.js';

export const getPhysicalgoodsHealth: () => Promise<PhysicalgoodsHealth> =
  createModuleHealthCheck('physicalgoods', probePhysicalgoodsDependencies);
