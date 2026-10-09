import type { Response } from 'express';
import type { ModuleHealth } from '../types/api.types.js';
import { sendError, sendSuccess } from './api-response.js';

export function sendModuleHealth(response: Response, health: ModuleHealth): void {
  response.setHeader('Cache-Control', 'no-store');
  if (health.status === 'unavailable') {
    sendError(response, 503, 'DEPENDENCY_UNAVAILABLE', 'A required dependency is unavailable');
    return;
  }
  sendSuccess(response, health);
}
