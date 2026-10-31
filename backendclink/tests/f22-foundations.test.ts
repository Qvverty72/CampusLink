import assert from 'node:assert/strict';
import { after, before, test, mock } from 'node:test';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { Db, MongoNetworkError, ObjectId } from 'mongodb';
import express, { type Express } from 'express';
import type { VerifiedAuthConnection } from '../src/modules/auth/auth.types.js';
import type { ActivityDocument } from '../src/modules/activities/activities.types.js';
import type { CampusMapDocument } from '../src/modules/maps/map.types.js';

const campus = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
const userId = '11111111-1111-4111-8111-111111111111';
const creator = '44444444-4444-4444-8444-444444444444';
const now = new Date('2099-10-10T12:00:00Z');
const auth = (): VerifiedAuthConnection => ({ userId, campusId: campus, roles: [], permissions: [], profile: {
  id: userId, campus_id: campus, institucion_id: campus, nombre_completo: 'Cuenta vigente', foto_path: null,
  verificado_en: now.toISOString(), estado_cuenta: 'ACTIVA', deleted_at: null,
} });
const map: CampusMapDocument = { campusId: campus, status: 'ACTIVE', version: 1, createdAt: now, updatedAt: now,
  buildings: [{ id: 'h', name: 'Edificio H', floors: [{ id: 'h1', name: 'Piso 1', pois: [] }] }] };
const doc = (patch: Partial<ActivityDocument> = {}): ActivityDocument => ({ _id: new ObjectId(), campusId: campus,
  createdByUserId: creator, title: 'Actividad visible', description: 'Referencia relacional válida',
  type: 'COMMUNITY_ACTIVITY', status: 'ACTIVE', visibility: 'PUBLIC', startAt: now,
  endAt: new Date('2099-10-11T12:00:00Z'), location: { buildingKey: 'h', floorKey: 'h1' },
  participantCount: 1, createdAt: now, updatedAt: now, ...patch });
const dependencies = { getActiveMap: async () => map, now: () => now };
const network = globalThis.fetch;
before(() => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
    SUPABASE_URL: 'https://f22-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'sb_secret_test' });
});
after(async () => {
  globalThis.fetch = network;
  await (await import('../src/database/mongodb/client.js')).closeMongoDB();
});

async function withServer(app: Express, run: (base: string) => Promise<void>) {
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await run('http://127.0.0.1:' + (server.address() as AddressInfo).port); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}

test('[F2.2-08] operational activity reads omit retired content without mutating its history or participations', async () => {
  const { getActivities } = await import('../src/modules/activities/activities.service.js');
  const documents = [doc({ createdByUserId: userId }), doc({ deletedAt: now }), doc({ status: 'DELETED' }), doc({ visibility: 'HIDDEN' })];
  const original = structuredClone(documents.map(row => ({ ...row, _id: row._id.toHexString() })));
  const result = await getActivities(auth(), {}, { ...dependencies, findActivities: async () => documents });
  assert.deepEqual(result.map(row => row.id), [documents[0]._id.toHexString()]);
  assert.deepEqual(documents.map(row => ({ ...row, _id: row._id.toHexString() })), original);
});

