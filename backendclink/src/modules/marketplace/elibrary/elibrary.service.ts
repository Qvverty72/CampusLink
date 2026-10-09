import { createModuleHealthCheck } from '../../../services/module-health.js';
import { probeElibraryDependencies } from './elibrary.repository.js';
import type { ElibraryHealth } from './elibrary.types.js';

export const getElibraryHealth: () => Promise<ElibraryHealth> =
  createModuleHealthCheck('elibrary', probeElibraryDependencies);
