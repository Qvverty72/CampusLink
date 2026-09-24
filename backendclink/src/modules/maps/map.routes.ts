import { Router } from 'express';

import { getActiveMapController } from './map.controller.js';

export const mapRouter = Router();

mapRouter.get('/:campusId/active', getActiveMapController);
