import type { RequestHandler } from 'express';

import { getActiveMap } from './map.service.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const getActiveMapController: RequestHandler<{
  campusId: string;
}> = async (request, response) => {
  const campusId = request.params.campusId?.trim();

  if (!campusId || !UUID_PATTERN.test(campusId)) {
    response.status(400).json({ error: 'Invalid campusId' });
    return;
  }

  try {
    const campusMap = await getActiveMap(campusId);

    if (!campusMap) {
      response.status(404).json({ error: 'Active campus map not found' });
      return;
    }

    response.status(200).json(campusMap);
  } catch (error: unknown) {
    console.error('Failed to get active campus map', {
      campusId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    response.status(500).json({ error: 'Internal server error' });
  }
};
