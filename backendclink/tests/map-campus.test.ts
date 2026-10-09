import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchActiveCampusMap } from '../../frontendclink/src/three/api/mapApi.js';
import { useMapDataStore } from '../../frontendclink/src/three/store/mapDataStore.js';
const oldCampus = '22222222-2222-4222-8222-222222222222';
const nextCampus = '33333333-3333-4333-8333-333333333333';

test('new campus replaces cache and ignores a late response from the old campus', async () => {
  const original = globalThis.fetch;
  const requests: { campusId: string; resolve: (value: Response) => void }[] = [];
  globalThis.fetch = async input => new Promise(resolve => {
    const campusId = new URL(String(input)).pathname.split('/').at(-2)!;
    requests.push({ campusId, resolve });
  });
  try {
    const previous = useMapDataStore.getState().loadMap(oldCampus);
    const current = useMapDataStore.getState().loadMap(nextCampus);
    assert.deepEqual(requests.map(row => row.campusId), [oldCampus, nextCampus]);
    assert.equal(useMapDataStore.getState().data, null);
    requests[1].resolve(Response.json({ data: { campusId: nextCampus, version: 2, buildings: [] } }));
    await current; assert.equal(useMapDataStore.getState().data?.campusId, nextCampus);
    requests[0].resolve(Response.json({ data: { campusId: oldCampus, version: 1, buildings: [] } }));
    await previous; assert.equal(useMapDataStore.getState().data?.campusId, nextCampus);
    await useMapDataStore.getState().loadMap(nextCampus); assert.equal(requests.length, 2);
  } finally { globalThis.fetch = original; useMapDataStore.setState({ data: null, isLoading: false, error: null }); }
});
test('map rejects a response for another campus and malformed identifiers', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ data: { campusId: oldCampus, buildings: [] } });
  try {
    await assert.rejects(fetchActiveCampusMap(nextCampus), /no corresponde/);
    await assert.rejects(fetchActiveCampusMap('../profile'), /Invalid campus/);
  } finally { globalThis.fetch = original; }
});
