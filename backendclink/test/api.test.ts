import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';

import express, { type Express } from 'express';
import { ObjectId } from 'mongodb';

import { createApp } from '../src/app.js';
import { apiErrorHandler } from '../src/middleware/apiErrorHandler.js';
import { getValidatedRequest, validateRequest } from '../src/middleware/validateRequest.js';
import { parseActiveMapParams } from '../src/modules/maps/map.validation.js';
import { ApiError } from '../src/services/apiError.js';
import { createPaginatedResult, parsePaginationQuery } from '../src/services/pagination.js';
import { sendSuccess } from '../src/services/apiResponse.js';
import type { RequestParser } from '../src/types/api.js';
import { ApiClientError, fetchActiveCampusMap } from '../../frontendclink/src/three/api/mapApi.js';

const CAMPUS_ID = '22222222-2222-4222-8222-222222222222';

async function withServer(
  app: Express,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const parseLabelBody: RequestParser = (input) => {
  if (!isRecord(input) || typeof input.label !== 'string' || input.label.trim() === '') {
    return {
      success: false,
      issues: [{ field: 'label', message: 'label is required.' }],
    };
  }

  return { success: true, data: { label: input.label.trim() } };
};

function createValidationHarness(): Express {
  const app = express();
  app.use(express.json());

  app.post(
    '/validate/:campusId',
    validateRequest({
      params: parseActiveMapParams,
      query: parsePaginationQuery,
      body: parseLabelBody,
    }),
    (_request, response) => {
      sendSuccess(response, getValidatedRequest(response));
    },
  );
  app.get('/created', (_request, response) => {
    sendSuccess(response, { id: 'created' }, { status: 201 });
  });
  app.delete('/empty', (_request, response) => {
    sendSuccess(response, undefined, { status: 204 });
  });
  app.get('/limited', () => {
    throw new ApiError(429, 'RATE_LIMIT_EXCEEDED', 'Too many requests.', {
      retryAfterSeconds: 30,
    });
  });
  app.get('/unavailable', () => {
    throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'mongodb://private-host/secret');
  });
  app.get('/unauthenticated', () => {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.');
  });
  app.get('/forbidden', () => {
    throw new ApiError(403, 'FORBIDDEN', 'Permission denied.');
  });
  app.get('/conflict', () => {
    throw new ApiError(409, 'CONFLICT', 'The resource conflicts with current state.');
  });
  app.get('/internal', () => {
    throw new Error('Database URI mongodb://private-host/secret');
  });
  app.use((_request, _response, next) => {
    next(new ApiError(404, 'NOT_FOUND', 'Test resource not found.'));
  });
  app.use(apiErrorHandler);

  return app;
}

test('leaves health unchanged and reports unknown API routes with a common 404', async () => {
  const app = createApp({ getActiveMap: async () => null });

  await withServer(app, async (baseUrl) => {
    const health = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const missing = await fetch(`${baseUrl}/api/v1/no-such-route`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), {
      error: { code: 'NOT_FOUND', message: 'API endpoint not found.' },
    });
  });
});

test('returns a success envelope for the active map and the frontend still parses it', async () => {
  const campusMap = {
    _id: new ObjectId(),
    campusId: CAMPUS_ID,
    version: 1,
    status: 'ACTIVE' as const,
    buildings: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const app = createApp({ getActiveMap: async () => campusMap });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/maps/${CAMPUS_ID}/active`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      data: {
        _id: campusMap._id.toHexString(),
        campusId: CAMPUS_ID,
        version: 1,
        status: 'ACTIVE',
        buildings: [],
        createdAt: campusMap.createdAt.toISOString(),
        updatedAt: campusMap.updatedAt.toISOString(),
      },
    });
  });

  const frontendMap = {
    _id: 'map-id',
    version: 7,
    campusId: CAMPUS_ID,
    status: 'ACTIVE' as const,
    buildings: [{
      id: 'A',
      name: 'Building A',
      focusTarget: [0, 0, 0],
      focusPosition: [1, 2, 3],
      floors: [{
        id: 'floor-id',
        level: 1,
        meshName: 'A_1',
        name: 'First floor',
        description: 'Ground floor',
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
        subMeshes: [],
        pois: [],
      }],
    }],
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    JSON.stringify({ data: frontendMap }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

  try {
    const runtimeMap = await fetchActiveCampusMap();
    assert.equal(runtimeMap.version, 7);
    assert.equal(runtimeMap.campusId, CAMPUS_ID);
    assert.deepEqual(runtimeMap.buildingFloors.A, ['A_1']);
    assert.deepEqual(runtimeMap.buildingConfigs.A.focusPosition, [1, 2, 3]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects a malformed campus ID before calling the map service', async () => {
  let serviceCalls = 0;
  const app = createApp({
    getActiveMap: async () => {
      serviceCalls += 1;
      return null;
    },
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/maps/not-a-uuid/active`);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        details: [{
          field: 'campusId',
          message: 'campusId must be a valid UUID.',
        }],
      },
    });
    assert.equal(serviceCalls, 0);
  });
});

test('returns a common 404 error when the active map does not exist', async () => {
  const app = createApp({ getActiveMap: async () => null });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/maps/${CAMPUS_ID}/active`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: {
        code: 'NOT_FOUND',
        message: 'Active campus map not found.',
      },
    });
  });
});

test('sanitizes errors raised by the active map service', async () => {
  const app = createApp({
    getActiveMap: async () => {
      throw new Error('MongoDB query failed for mongodb://private-host/secret');
    },
  });
  const originalConsoleError = console.error;
  console.error = () => undefined;

  try {
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/maps/${CAMPUS_ID}/active`);
      assert.equal(response.status, 500);
      const body = await response.text();
      assert.equal(body.includes('private-host'), false);
      assert.equal(body.includes('secret'), false);
      assert.deepEqual(JSON.parse(body), {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error.',
        },
      });
    });
  } finally {
    console.error = originalConsoleError;
  }
});

test('returns field validation errors for path, query, and body before a controller runs', async () => {
  const app = createValidationHarness();

  await withServer(app, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/validate/not-a-uuid?page=0&limit=101`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
    );

    assert.equal(response.status, 400);
    const body = await response.json() as {
      error: { details: Array<{ field: string; message: string }> };
    };
    assert.deepEqual(body.error.details.map(({ field }) => field), [
      'campusId',
      'page',
      'limit',
      'label',
    ]);
    assert.match(body.error.details[2].message, /100/);
  });
});

test('returns HTTP 400 for malformed JSON with a safe body-field detail', async () => {
  const app = createValidationHarness();

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/validate/${CAMPUS_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        details: [{
          field: 'body',
          message: 'Request body must contain valid JSON.',
        }],
      },
    });
  });
});

test('supports default and bounded pagination and produces hasMore metadata', () => {
  assert.deepEqual(parsePaginationQuery({}), {
    success: true,
    data: { page: 1, limit: 20, offset: 0 },
  });
  assert.deepEqual(parsePaginationQuery({ page: '3', limit: '2' }), {
    success: true,
    data: { page: 3, limit: 2, offset: 4 },
  });
  assert.equal(parsePaginationQuery({ page: '1', limit: '100' }).success, true);

  const invalid = parsePaginationQuery({ page: '-1', limit: '101' });
  assert.equal(invalid.success, false);
  if (!invalid.success) {
    assert.deepEqual(invalid.issues.map(({ field }) => field), ['page', 'limit']);
  }

  assert.deepEqual(
    createPaginatedResult(['one', 'two', 'three'], { page: 2, limit: 2, offset: 2 }),
    {
      data: ['one', 'two'],
      meta: { page: 2, limit: 2, hasMore: true },
    },
  );
  assert.deepEqual(
    createPaginatedResult(['one'], { page: 1, limit: 20, offset: 0 }).meta,
    { page: 1, limit: 20, hasMore: false },
  );
});

test('sends HTTP 201 and an empty HTTP 204 response', async () => {
  const app = createValidationHarness();

  await withServer(app, async (baseUrl) => {
    const created = await fetch(`${baseUrl}/created`);
    assert.equal(created.status, 201);
    assert.deepEqual(await created.json(), { data: { id: 'created' } });

    const empty = await fetch(`${baseUrl}/empty`, { method: 'DELETE' });
    assert.equal(empty.status, 204);
    assert.equal(await empty.text(), '');
  });
});

test('adds Retry-After for 429 and sanitizes 500/503 responses', async () => {
  const app = createValidationHarness();

  await withServer(app, async (baseUrl) => {
    const limited = await fetch(`${baseUrl}/limited`);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('Retry-After'), '30');
    assert.deepEqual(await limited.json(), {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests.',
      },
    });

    const unavailable = await fetch(`${baseUrl}/unavailable`);
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), {
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service temporarily unavailable.',
      },
    });

    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      const internal = await fetch(`${baseUrl}/internal`);
      assert.equal(internal.status, 500);
      const body = await internal.text();
      assert.equal(body.includes('private-host'), false);
      assert.equal(body.includes('secret'), false);
      assert.equal(body.includes('mongodb'), false);
      assert.deepEqual(JSON.parse(body), {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error.',
        },
      });
    } finally {
      console.error = originalConsoleError;
    }
  });
});

test('uses stable status and error codes for authentication and conflict responses', async () => {
  const app = createValidationHarness();

  await withServer(app, async (baseUrl) => {
    const expected = [
      ['/unauthenticated', 401, 'UNAUTHENTICATED'],
      ['/forbidden', 403, 'FORBIDDEN'],
      ['/conflict', 409, 'CONFLICT'],
    ] as const;

    for (const [path, status, code] of expected) {
      const response = await fetch(`${baseUrl}${path}`);
      assert.equal(response.status, status);
      const body = await response.json() as { error: { code: string } };
      assert.equal(body.error.code, code);
    }
  });
});

test('frontend exposes backend validation details as an API client error', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    JSON.stringify({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        details: [{ field: 'campusId', message: 'campusId must be a valid UUID.' }],
      },
    }),
    { status: 400, headers: { 'Content-Type': 'application/json' } },
  );

  try {
    await assert.rejects(fetchActiveCampusMap(), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.status, 400);
      assert.equal(error.code, 'VALIDATION_ERROR');
      assert.equal(error.details?.[0].field, 'campusId');
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
