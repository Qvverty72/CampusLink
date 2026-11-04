import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../src/database/mongodb/006_cabin_basement.mongosh.js', import.meta.url), 'utf8');
const glb = readFileSync(new URL('../../frontendclink/assets/models/modelomejoradojunto.glb', import.meta.url));
assert.equal(glb.readUInt32LE(0), 0x46546c67);
const gltf = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
const campusId = '22222222-2222-4222-8222-222222222222';
const cabinIds: Record<string, string> = { cabina: 'cabin03', cabinb: 'cabin02', cabinc: 'cabin01' };
const cabinNames: Record<string, string> = { cabin01: 'Cabaña C', cabin02: 'Cabaña B', cabin03: 'Cabaña A' };
type Row = Record<string, any>;

// Deriva las expectativas del GLB entregado, independientemente del manifiesto de migración.
const modelFloors: Row[] = gltf.nodes.filter((node: Row) =>
  /^(cabin[abc]|[defgh]building|cti|gym)_floor-?\d+$/.test(node.name)).map((node: Row) => {
    const [rawBuilding, rawFloor] = node.name.split('_floor');
    const buildingId = cabinIds[rawBuilding] ?? rawBuilding;
    const level = Number(rawFloor);
    const suffix = cabinIds[rawBuilding] ? ({ 1: '3', '-1': '2', '-2': '1', '-3': '-3' } as Record<string, string>)[rawFloor] : rawFloor;
    const meshName = buildingId + '_floor' + suffix;
    const mesh = gltf.meshes[node.mesh];
    const base = mesh.name.replace(/\./g, '');
    assert.equal(node.rotation, undefined);
    assert.equal(node.scale, undefined);
    return { buildingId, meshName, level, position: node.translation,
      subMeshes: mesh.primitives.map((_primitive: unknown, index: number) => base + (index ? '_' + index : '')) };
  });

function fixture(): Row {
  const buildings: Row[] = [];
  for (const expected of modelFloors) {
    if (expected.level === -3) continue;
    let building = buildings.find((item) => item.id === expected.buildingId);
    if (!building) {
      building = { id: expected.buildingId, name: cabinNames[expected.buildingId] ?? expected.buildingId,
        focusTarget: [0.1, 0.08, 0.1], focusPosition: [0.3, 0.2, 0.3], metadata: { preserved: true }, floors: [] };
      buildings.push(building);
    }
    const isCabin = Boolean(cabinNames[building.id]);
    const originalLevel = isCabin ? Number(expected.meshName.split('_floor')[1]) : expected.level;
    const visibleLevel = isCabin ? ({ 1: -3, 2: -2, 3: 1 } as Record<number, number>)[originalLevel] : originalLevel;
    const transform = { position: expected.position.map((n: number) => Number(n.toFixed(8))),
      rotation: [0, 0, 0], scale: [1, 1, 1], customTransformMetadata: true };
    if (building.id === 'cti') {
      transform.position = [-0.09296654, 0.00503574, 0.45533523];
      transform.rotation = [0, -0.02192614, 0];
      transform.scale = [1.24738979, 1.24738979, 1.24738979];
    }
    building.floors.push({ id: expected.meshName + '-domain-id', meshName: expected.meshName,
      level: originalLevel, name: building.name + ' - Piso ' + visibleLevel,
      description: 'Espacio verificado. Piso ' + visibleLevel + '. No cambiar Piso -30.',
      transform, subMeshes: expected.subMeshes, floorMetadata: { preserved: true },
      pois: [{ poiKey: expected.meshName + '-historical-poi', name: 'Lugar verificado',
        description: 'Acceso en Piso ' + visibleLevel + '.', isVisible: originalLevel !== 1,
        position: { x: 1, y: 2, z: 3 }, imageKeys: ['photo.jpg'], originalMetadata: { keep: true } }],
    });
  }
  // La selección no puede depender de índices ni del orden previo de edificios/pisos.
  buildings.reverse();
  for (const building of buildings) building.floors.sort((a: Row, b: Row) => a.level - b.level);
  return { _id: 'existing-map-id', campusId, status: 'ACTIVE', version: 7,
    model: { key: 'campus-main', sourceHash: 'historical-generator-hash', dataSource: 'historical-source' },
    createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-10-19T00:00:00Z'), buildings };
}
function harness(map = fixture(), options: { absentCollection?: boolean; duplicateMap?: boolean; race?: boolean } = {}) {
  let writes = 0;
  const output: string[] = [];
  return { map, output, get writes() { return writes; }, run(apply = false) {
    runInNewContext(source, {
      CABIN_BASEMENT_APPLY: apply,
      db: { getName: () => 'campuslink', getCollectionNames: () => options.absentCollection ? [] : ['campus_maps'],
        getCollection(name: string) {
          assert.equal(name, 'campus_maps');
          return {
            find(query: unknown) {
              assert.equal(JSON.stringify(query), JSON.stringify({ campusId, status: 'ACTIVE' }));
              return { limit: (count: number) => { assert.equal(count, 2); return { toArray: () => options.duplicateMap
                ? [structuredClone(map), structuredClone(map)] : [structuredClone(map)] }; } };
            },
            updateOne(query: Row, update: Row, updateOptions: unknown) {
              writes++;
              assert.equal(JSON.stringify(updateOptions), JSON.stringify({ upsert: false }));
              assert.equal(query._id, map._id);
              assert.equal(query.campusId, campusId);
              assert.equal(query.status, 'ACTIVE');
              assert.equal(query.version, map.version);
              assert.equal(JSON.stringify(query.buildings), JSON.stringify(map.buildings));
              assert.equal(query.deletedAt, null);
              if (options.race) return { matchedCount: 0, modifiedCount: 0 };
              for (const [path, value] of Object.entries(update.$set)) {
                const parts = path.split('.');
                let target = map;
                for (const part of parts.slice(0, -1)) target = target[part];
                target[parts.at(-1)!] = structuredClone(value);
              }
              return { matchedCount: 1, modifiedCount: 1 };
            },
          };
        } }, print: (value: string) => output.push(value),
    });
  } };
}

test('preview writes nothing; apply produces 36 floors matching GLB and rerun writes nothing', () => {
  assert.equal(modelFloors.length, 36);
  const h = harness();
  const original = structuredClone(h.map);
  assert.equal(original.buildings.flatMap((b: Row) => b.floors).length, 33);
  h.run();
  assert.equal(h.writes, 0);
  assert.deepEqual(h.map, original);
  h.run(true);
  assert.equal(h.writes, 1);
  assert.equal(h.map.buildings.length, 10);
  assert.equal(h.map.buildings.flatMap((b: Row) => b.floors).length, 36);
  for (const expected of modelFloors) {
    const building = h.map.buildings.find((b: Row) => b.id === expected.buildingId);
    const floor = building.floors.find((f: Row) => f.meshName === expected.meshName);
    assert.deepEqual(floor.transform.position, expected.position);
    assert.deepEqual(floor.transform.rotation, [0, 0, 0]);
    assert.deepEqual(floor.transform.scale, [1, 1, 1]);
    assert.deepEqual(floor.subMeshes, expected.subMeshes);
    assert.equal(floor.level, expected.level);
    if (cabinNames[building.id]) {
      assert.deepEqual(building.floors.map((f: Row) => f.level), [-3, -2, -1, 1]);
      assert.equal(floor.name, building.name + ' - Piso ' + expected.level);
    }
    if (expected.level === -3) { assert.equal(floor.id, expected.meshName); assert.deepEqual(floor.pois, []); }
    else assert.equal(floor.id, expected.meshName + '-domain-id');
  }
  for (const field of ['_id', 'version', 'status', 'campusId', 'createdAt', 'model']) assert.deepEqual(h.map[field], original[field]);
  const applied = structuredClone(h.map);
  h.run(true);
  assert.equal(h.writes, 1);
  assert.deepEqual(h.map, applied);
});

test('physical reassignment preserves POIs, IDs and metadata while correcting only old floor mentions', () => {
  const h = harness();
  const original = structuredClone(h.map);
  h.run(true);
  for (const before of original.buildings) {
    const after = h.map.buildings.find((b: Row) => b.id === before.id);
    assert.deepEqual(after.metadata, before.metadata);
    assert.equal(after.name, before.name);
    if (!cabinNames[before.id] && before.id !== 'cti') {
      assert.deepEqual(after.focusTarget, before.focusTarget);
      assert.deepEqual(after.focusPosition, before.focusPosition);
    }
    for (const floor of before.floors) {
      const updated = after.floors.find((f: Row) => f.id === floor.id);
      assert.deepEqual(updated.floorMetadata, floor.floorMetadata);
      assert.equal(updated.transform.customTransformMetadata, true);
      const expected = structuredClone(floor.pois[0]);
      if (cabinNames[before.id] && floor.level < 3) {
        const oldLevel = floor.level === 1 ? -3 : -2;
        const newLevel = floor.level === 1 ? -2 : -1;
        expected.description = expected.description.replace('Piso ' + oldLevel, 'Piso ' + newLevel);
        assert.equal(updated.description, floor.description.replace('Piso ' + oldLevel + '.', 'Piso ' + newLevel + '.'));
      } else assert.equal(updated.description, floor.description);
      assert.deepEqual(updated.pois, [expected]);
    }
  }
  assert.deepEqual(h.map.buildings.find((b: Row) => b.id === 'cti').focusTarget, [-0.093807, 0.002630, 0.433844]);
  assert.deepEqual(h.map.buildings.find((b: Row) => b.id === 'cabin03').focusPosition, [0.428896, 0.320027, 0.194457]);
});

test('incomplete or ambiguous hierarchy fails before writes and concurrent edits reject the atomic update', () => {
  const cases: ((map: Row) => void)[] = [
    map => { map.buildings = map.buildings.filter((b: Row) => b.id !== 'cabin02'); },
    map => { map.buildings.find((b: Row) => b.id === 'cabin03').floors.pop(); },
    map => { map.buildings.find((b: Row) => b.id === 'cti').floors[0].subMeshes = ['wrong-model']; },
    map => { map.buildings.find((b: Row) => b.id === 'cabin01').floors[0].id = 'cabin01_floor-3'; },
    map => { map.buildings.find((b: Row) => b.id === 'cabin01').floors[0].level = 99; },
    map => { map.buildings[0].floors[0].meshName = map.buildings[1].floors[0].meshName; },
  ];
  for (const change of cases) {
    const map = fixture(); change(map);
    const before = structuredClone(map);
    const h = harness(map);
    assert.throws(() => h.run(true));
    assert.equal(h.writes, 0);
    assert.deepEqual(map, before);
  }
  for (const options of [{ absentCollection: true }, { duplicateMap: true }]) {
    const h = harness(fixture(), options);
    assert.throws(() => h.run(true)); assert.equal(h.writes, 0);
  }
  const h = harness(fixture(), { race: true });
  const before = structuredClone(h.map);
  assert.throws(() => h.run(true), /Map changed during preflight/);
  assert.equal(h.writes, 1);
  assert.deepEqual(h.map, before);
});
