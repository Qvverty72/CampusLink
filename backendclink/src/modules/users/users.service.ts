import { createModuleHealthCheck } from '../../services/module-health.js';
import { probeUsersDependencies } from './users.repository.js';
import type { UsersHealth } from './users.types.js';

export const getUsersHealth: () => Promise<UsersHealth> =
  createModuleHealthCheck('users', probeUsersDependencies);
