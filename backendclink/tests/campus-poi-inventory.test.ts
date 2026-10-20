import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../src/database/mongodb/004_campus_poi_inventory.mongosh.js', import.meta.url), 'utf8');
const campusId = '22222222-2222-4222-8222-222222222222';
type Poi = Record<string, any>;
const fixture = () => ({
  _id: 'existing-map', campusId, status: 'ACTIVE', version: 7,
  buildings: Object.entries({ hbuilding: 8, dbuilding: 1, ebuilding: 5, fbuilding: 4,
    gbuilding: 4, cabin03: 3, cabin02: 3, cabin01: 3, cti: 1, gym: 1 }).map(([id, count]) => ({
      id, name: id, transform: { scale: 1 },
      floors: Array.from({ length: count }, (_, index) => ({
        id: `${id}-preserved-id-${index + 1}`, level: index + 1,
        meshName: `${id}_floor${index + 1}`, transform: { x: 12 }, pois: [] as Poi[],
      })),
    })),
});
type MapFixture = ReturnType<typeof fixture>;
const floor = (map: MapFixture, id: string, level: number) =>
  map.buildings.find((building) => building.id === id)!.floors.find((item) => item.level === level)!;
const existingPoi = (poiKey: string, name: string): Poi => ({
  poiKey, name, type: 'OTHER', icon: 'custom', description: 'Descripción verificada',
  position: { x: 1, y: 2, z: 3 }, isFixed: false, isVisible: true,
  imageKeys: ['existing-real.jpg'], historicalMetadata: { original: true },
});

function harness(map = fixture(), options: { absentCollection?: boolean; duplicateMap?: boolean; race?: boolean } = {}) {
  let writes = 0;
  const snapshots: string[] = [];
  const collection = {
    find(query: unknown) {
      assert.equal(JSON.stringify(query), JSON.stringify({ campusId, status: 'ACTIVE' }));
      return { limit: () => ({ toArray: () => options.duplicateMap
        ? [structuredClone(map), structuredClone(map)] : [structuredClone(map)] }) };
    },
    updateOne(query: any, update: any, updateOptions: unknown) {
      writes++;
      assert.equal(JSON.stringify(updateOptions), JSON.stringify({ upsert: false }));
      assert.equal(query._id, map._id);
      assert.equal(query.campusId, campusId);
      assert.equal(query.status, 'ACTIVE');
      assert.equal(JSON.stringify(query.buildings), JSON.stringify(map.buildings));
      if (options.race) return { matchedCount: 0, modifiedCount: 0 };
      for (const [path, value] of Object.entries(update.$set)) {
        const parts = path.split('.');
        let target: any = map;
        for (const part of parts.slice(0, -1)) target = target[part];
        target[parts.at(-1)!] = structuredClone(value);
      }
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };
  return {
    map, get writes() { return writes; }, snapshots,
    run(apply = false) {
      runInNewContext(source, {
        POI_INVENTORY_APPLY: apply,
        db: {
          getName: () => 'campuslink',
          getCollectionNames: () => options.absentCollection ? [] : ['campus_maps'],
          getCollection: (name: string) => { assert.equal(name, 'campus_maps'); return collection; },
        },
        print: (value: string) => snapshots.push(value),
      });
    },
  };
}

test('preview writes nothing; apply adds exactly the supplied 17 POI and rerun is a no-op', () => {
  const h = harness();
  const before = JSON.stringify(h.map);
  h.run();
  assert.equal(h.writes, 0);
  assert.equal(JSON.stringify(h.map), before);
  h.run(true);
  assert.equal(h.writes, 1);
  const expected: Record<string, Record<number, string[]>> = {
    hbuilding: { 1: ['Auditorio', 'Casino'], 2: ['Biblioteca'], 4: ['Cetecom'] },
    ebuilding: { 1: ['Caja de pago', 'Enfermería'] },
    fbuilding: { 1: ['Capilla', 'Patio de comidas'], 2: ['Casino'], 3: ['Cetecom', 'Central de apuntes'], 4: ['Terraza'] },
    cabin03: { 2: ['CIIT'], 3: ['Punto estudiantil', 'Radio'] },
    gym: { 1: ['Multicancha', 'Sala de musculación'] },
  };
  let count = 0;
  for (const building of h.map.buildings) for (const item of building.floors) {
    assert.deepEqual(item.pois.map((poi) => poi.name), expected[building.id]?.[item.level] ?? []);
    assert.equal(item.id, `${building.id}-preserved-id-${item.level}`);
    assert.deepEqual(item.transform, { x: 12 });
    for (const poi of item.pois) {
      count++;
      assert.equal(poi.isVisible, true);
      assert.equal(poi.positionPending, true);
      assert.deepEqual(poi.position, { x: 0, y: 0, z: 0 });
      assert.equal(poi.imageKeys.length, 1);
      assert.match(poi.imageKeys[0], /^[a-z0-9-]+\.jpg$/);
    }
  }
  assert.equal(count, 17);
  assert.equal(h.map.version, 7);
  const applied = JSON.stringify(h.map);
  h.run(true);
  assert.equal(h.writes, 1);
  assert.equal(JSON.stringify(h.map), applied);
});

test('the applied 15-POI catalog gains only Enfermería and Patio de comidas while preserving historical records', () => {
  const map = fixture();
  const historicalCatalog: [string, number, string, string][] = [
    ['hbuilding', 1, 'hbuilding-floor1-auditorio', 'Auditorio'],
    ['hbuilding', 1, 'hbuilding-floor1-casino', 'Casino'],
    ['hbuilding', 2, 'hbuilding-floor2-biblioteca', 'Biblioteca'],
    ['hbuilding', 4, 'hbuilding-floor4-cetecom', 'Cetecom'],
    ['ebuilding', 1, 'ebuilding-floor1-caja-de-pago', 'Caja de pago'],
    ['fbuilding', 1, 'fbuilding-floor1-capilla', 'Capilla'],
    ['fbuilding', 2, 'fbuilding-floor2-casino', 'Casino'],
    ['fbuilding', 3, 'fbuilding-floor3-cetecom', 'Cetecom'],
    ['fbuilding', 3, 'fbuilding-floor3-central-de-apuntes', 'Central de apuntes'],
    ['fbuilding', 4, 'fbuilding-floor4-terraza', 'Terraza'],
    ['cabin03', 2, 'cabin03-floor2-ciit', 'CIIT'],
    ['cabin03', 3, 'cabin03-floor3-punto-estudiantil', 'Punto estudiantil'],
    ['cabin03', 3, 'cabin03-floor3-radio', 'Radio'],
    ['gym', 1, 'gym-floor1-multicancha', 'Multicancha'],
    ['gym', 1, 'gym-floor1-sala-de-musculacion', 'Sala de musculación'],
  ];
  for (const [buildingId, level, poiKey, name] of historicalCatalog) {
    floor(map, buildingId, level).pois.push({ ...existingPoi(poiKey, name),
      id: `preserved-${poiKey}`, imageKeys: [`${poiKey}.jpg`],
      createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-10T00:00:00.000Z' });
  }
  const before = structuredClone(map);
  const h = harness(map);
  h.run();
  assert.equal(h.writes, 0);
  assert.deepEqual(map, before);
  h.run(true);
  assert.equal(h.writes, 1);
  const newPoiKeys = ['ebuilding-floor1-enfermeria', 'fbuilding-floor1-patio-de-comidas'];
  const withoutNewPois = structuredClone(map);
  for (const building of withoutNewPois.buildings) for (const item of building.floors) {
    item.pois = item.pois.filter((poi) => !newPoiKeys.includes(poi.poiKey));
  }
  // Only the map's update timestamp may change alongside the two insertions.
  const { updatedAt: mapUpdatedAt, ...preservedMap } = withoutNewPois as typeof withoutNewPois & { updatedAt: Date };
  assert.ok(mapUpdatedAt instanceof Date);
  // This compares IDs, coordinates, metadata, POI timestamps, photos and the whole existing hierarchy.
  assert.deepEqual(preservedMap, before);
  const enfermeria = floor(map, 'ebuilding', 1).pois.find((poi) => poi.poiKey === newPoiKeys[0])!;
  const patio = floor(map, 'fbuilding', 1).pois.find((poi) => poi.poiKey === newPoiKeys[1])!;
  assert.equal(enfermeria.name, 'Enfermería');
  assert.equal(enfermeria.type, 'SERVICE');
  assert.equal(enfermeria.icon, 'medical-services');
  assert.deepEqual(enfermeria.imageKeys, ['ebuilding-floor1-enfermeria.jpg']);
  assert.equal(patio.name, 'Patio de comidas');
  assert.equal(patio.type, 'CAFETERIA');
  assert.equal(patio.icon, 'restaurant');
  assert.deepEqual(patio.imageKeys, ['fbuilding-floor1-patio-de-comidas.jpg']);
  assert.equal(map.buildings.flatMap((building) => building.floors.flatMap((item) => item.pois)).length, 17);
  const applied = JSON.stringify(map);
  h.run(true);
  assert.equal(h.writes, 1);
  assert.equal(JSON.stringify(map), applied);
});

test('empty floors are deactivated without deleting history; existing names keep their keys and real data', () => {
  const map = fixture();
  const withdrawn = existingPoi('cabin01-floor1-sala-reuniones', 'Sala de reuniones');
  floor(map, 'cabin01', 1).pois.push(withdrawn);
  const auditorium = existingPoi('historical-auditorium-key', ' AUDITORIO ');
  auditorium.isVisible = false;
  floor(map, 'hbuilding', 1).pois.push(auditorium, existingPoi('other-existing-poi', 'Otro lugar'));
  const h = harness(map);
  h.run(true);
  const retired = floor(map, 'cabin01', 1).pois[0];
  assert.equal(retired.poiKey, withdrawn.poiKey);
  assert.equal(retired.isVisible, false);
  assert.deepEqual(retired.historicalMetadata, withdrawn.historicalMetadata);
  const result = floor(map, 'hbuilding', 1).pois[0];
  assert.equal(result.poiKey, auditorium.poiKey);
  assert.equal(result.isVisible, true);
  assert.equal(result.name, 'Auditorio');
  assert.deepEqual(result.position, auditorium.position);
  assert.equal(result.description, auditorium.description);
  assert.equal(result.isFixed, false);
  assert.deepEqual(result.imageKeys, ['existing-real.jpg', 'hbuilding-floor1-auditorio.jpg']);
  assert.equal(floor(map, 'hbuilding', 1).pois[1].isVisible, true);
});

test('incomplete, ambiguous or inactive data stops all writes before changing any floor', () => {
  const cases: ((map: MapFixture) => void)[] = [
    (map) => { map.buildings = map.buildings.filter((building) => building.id !== 'gym'); },
    (map) => { map.buildings[0].floors.pop(); },
    (map) => { floor(map, 'hbuilding', 1).pois.push(existingPoi('a', 'Auditorio'), existingPoi('b', 'auditorio')); },
    (map) => { floor(map, 'hbuilding', 1).pois.push({ ...existingPoi('a', 'Auditorio'), deletedAt: '2026-10-01' }); },
    (map) => { floor(map, 'gym', 1).pois.push(existingPoi('hbuilding-floor1-auditorio', 'Otro lugar')); },
    (map) => { floor(map, 'gym', 1).pois.push(existingPoi('duplicated', 'A'), existingPoi('duplicated', 'B')); },
    (map) => { floor(map, 'hbuilding', 1).pois.push({ ...existingPoi('a', 'Auditorio'), position: { x: '1', y: 0, z: 0 } }); },
  ];
  for (const alter of cases) {
    const map = fixture();
    alter(map);
    const before = JSON.stringify(map);
    const h = harness(map);
    assert.throws(() => h.run(true));
    assert.equal(h.writes, 0);
    assert.equal(JSON.stringify(map), before);
  }
  for (const options of [{ absentCollection: true }, { duplicateMap: true }]) {
    const h = harness(fixture(), options);
    assert.throws(() => h.run(true));
    assert.equal(h.writes, 0);
  }
});

test('concurrent hierarchy edit rejects the atomic write without replacing the map', () => {
  const h = harness(fixture(), { race: true });
  const before = JSON.stringify(h.map);
  assert.throws(() => h.run(true), /Map changed during preflight/);
  assert.equal(h.writes, 1);
  assert.equal(JSON.stringify(h.map), before);
});

test('migrated cabin levels retain historical POI ownership and leave the new basement outside the old inventory', () => {
  const map = fixture();
  for (const building of map.buildings.filter((item) => item.id.startsWith('cabin'))) {
    for (const item of building.floors) item.level = ({ 1: -2, 2: -1, 3: 1 } as Record<number, number>)[item.level];
    building.floors.unshift({ id: building.id + '-new-basement', level: -3,
      meshName: building.id + '_floor-3', transform: { x: 12 },
      pois: [existingPoi(building.id + '-future-basement-poi', 'Futuro lugar del subterráneo')] });
  }
  const basements = map.buildings.filter((item) => item.id.startsWith('cabin'))
    .map((building) => structuredClone(building.floors[0]));
  const h = harness(map);
  h.run(true);
  assert.equal(h.writes, 1);
  assert.deepEqual(floor(map, 'cabin03', -1).pois.map((poi) => poi.poiKey), ['cabin03-floor2-ciit']);
  assert.deepEqual(floor(map, 'cabin03', 1).pois.map((poi) => poi.poiKey),
    ['cabin03-floor3-punto-estudiantil', 'cabin03-floor3-radio']);
  assert.match(floor(map, 'cabin03', -1).pois[0].description, /Piso -1\./);
  assert.deepEqual(map.buildings.filter((item) => item.id.startsWith('cabin'))
    .map((building) => building.floors[0]), basements);
  const applied = JSON.stringify(map);
  h.run(true);
  assert.equal(h.writes, 1);
  assert.equal(JSON.stringify(map), applied);
});
