import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiClientError, fetchActiveCampusMap } from '../../frontendclink/src/three/api/mapApi.js';
import { useMapDataStore } from '../../frontendclink/src/three/store/mapDataStore.js';
const oldCampus = '22222222-2222-4222-8222-222222222222';
const nextCampus = '33333333-3333-4333-8333-333333333333';
const token = 'map.test.token';

test('new campus replaces cache and ignores a late response from the old campus', async () => {
  const original = globalThis.fetch;
  const requests: { campusId: string; resolve: (value: Response) => void }[] = [];
  globalThis.fetch = async (input, init) => new Promise(resolve => {
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer ' + token);
    assert.equal(init?.cache, 'no-store'); assert.equal(init?.redirect, 'error');
    const campusId = new URL(String(input)).pathname.split('/').at(-2)!;
    requests.push({ campusId, resolve });
  });
  try {
    const previous = useMapDataStore.getState().loadMap(oldCampus, token);
    const current = useMapDataStore.getState().loadMap(nextCampus, token);
    assert.deepEqual(requests.map(row => row.campusId), [oldCampus, nextCampus]);
    assert.equal(useMapDataStore.getState().data, null);
    requests[1].resolve(Response.json({ data: { campusId: nextCampus, version: 2, buildings: [] } }));
    await current; assert.equal(useMapDataStore.getState().data?.campusId, nextCampus);
    requests[0].resolve(Response.json({ data: { campusId: oldCampus, version: 1, buildings: [] } }));
    await previous; assert.equal(useMapDataStore.getState().data?.campusId, nextCampus);
    await useMapDataStore.getState().loadMap(nextCampus, token); assert.equal(requests.length, 2);
  } finally { globalThis.fetch = original; useMapDataStore.setState({ data: null, isLoading: false, error: null }); }
});
test('map rejects a response for another campus and malformed identifiers', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ data: { campusId: oldCampus, buildings: [] } });
  try {
    await assert.rejects(fetchActiveCampusMap(nextCampus, token), /no corresponde/);
    await assert.rejects(fetchActiveCampusMap('../profile', token), /Invalid campus/);
  } finally { globalThis.fetch = original; }
});

test('map cannot fetch without a session and sends no token for malformed paths', async () => {
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({}); };
  try {
    await assert.rejects(fetchActiveCampusMap(oldCampus, ''), { status: 401 });
    await assert.rejects(fetchActiveCampusMap('../auth/me', token), /Invalid campus/);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

test('clearing map cache aborts in-flight data and requires a fresh authorized read for the same campus', async () => {
  const original = globalThis.fetch; let calls = 0, resolveOld!: (value: Response) => void;
  globalThis.fetch = async () => { calls++; return calls === 1 ? new Promise(resolve => { resolveOld = resolve; })
    : Response.json({ data: { campusId: oldCampus, version: 2, buildings: [] } }); };
  try {
    useMapDataStore.getState().clearMap();
    const previous = useMapDataStore.getState().loadMap(oldCampus, token);
    useMapDataStore.getState().clearMap();
    resolveOld(Response.json({ data: { campusId: oldCampus, version: 1, buildings: [] } }));
    await previous; assert.equal(useMapDataStore.getState().data, null);
    await useMapDataStore.getState().loadMap(oldCampus, token);
    assert.equal(calls, 2); assert.equal(useMapDataStore.getState().data?.version, 2);
    await assert.rejects(useMapDataStore.getState().loadMap(oldCampus, ''), { status: 401 });
    assert.equal(useMapDataStore.getState().data, null); assert.equal(calls, 2);
  } finally { globalThis.fetch = original; useMapDataStore.getState().clearMap(); }
});

test('401/403 clear map data and propagate to refresh identity instead of retaining stale authorization', async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [401, 403]) {
      useMapDataStore.getState().clearMap();
      globalThis.fetch = async () => Response.json({ error: { code: 'FORBIDDEN', message: 'Acceso denegado' } }, { status });
      await assert.rejects(useMapDataStore.getState().loadMap(oldCampus, token), error => error instanceof ApiClientError && error.status === status);
      assert.equal(useMapDataStore.getState().data, null);
      assert.equal(useMapDataStore.getState().isLoading, false);
    }
  } finally { globalThis.fetch = original; useMapDataStore.getState().clearMap(); }
});
