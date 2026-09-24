import { Router } from 'express';

import { getActiveMapController } from './map.controller.js';

// Este router solo declara transporte HTTP. La validación y la consulta quedan
// delegadas para mantener el flujo route → controller → service → repository.
export const mapRouter = Router();

mapRouter.get('/:campusId/active', getActiveMapController);
