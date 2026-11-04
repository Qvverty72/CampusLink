import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import * as THREE from 'three';
import ts from 'typescript';

const require = createRequire(import.meta.url);
// Drei's native entry uses CJS, while the scene's import uses Three's ESM export.
const { GLTFLoader } = require('three-stdlib');
const THREE_CJS = require('three');
const sourcePath = new URL('../src/three/components/CampusModel.tsx', import.meta.url);
const source = fs.readFileSync(sourcePath, 'utf8');
const model = fs.readFileSync(new URL('../assets/models/modelomejoradojunto.glb', import.meta.url));

// Node has no bitmap decoder. Keep all real GLTFLoader geometry/material parsing;
// only provide the browser's image-decoding interface for embedded textures.
globalThis.self ??= globalThis;
globalThis.ProgressEvent ??= class ProgressEvent {
  constructor(type, init) {
    this.type = type;
    Object.assign(this, init);
  }
};
globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });

const gltf = await new GLTFLoader().parseAsync(
  model.buffer.slice(model.byteOffset, model.byteOffset + model.byteLength),
  ''
);
gltf.scene.updateMatrixWorld(true);
const nodes = {};
gltf.scene.traverse((node) => { nodes[node.name] = node; });

const cabinIds = { cabina: 'cabin03', cabinb: 'cabin02', cabinc: 'cabin01' };
// Derive the fixture from the shipped GLB, without remote Mongo or ignored task
// snapshots. The cabin mapping preserves the domain identities described by GH35.
const floorMeshConfigs = gltf.scene.children.flatMap((group) => {
  const match = /^(cabina|cabinb|cabinc|[defgh]building|cti|gym)_floor(-?\d+)$/.exec(group.name);
  if (!match) return [];
  const [, modelBuilding, physicalLevel] = match;
  const buildingId = cabinIds[modelBuilding] ?? modelBuilding;
  const logicalSuffix = cabinIds[modelBuilding]
    ? ({ '-3': '-3', '-2': '1', '-1': '2', '1': '3' })[physicalLevel]
    : physicalLevel;
  const subMeshes = [];
  group.traverse((child) => { if (child.isMesh) subMeshes.push(child.name); });
  return [{
    meshName: `${buildingId}_floor${logicalSuffix}`,
    buildingId,
    position: group.position.toArray(),
    rotation: [group.rotation.x, group.rotation.y, group.rotation.z],
    scale: group.scale.toArray(),
    subMeshes,
  }];
});

function countMeshes(object) {
  let count = 0;
  object.traverse((node) => { if (node.isMesh) count += 1; });
  return count;
}

function renderCampus({ modelNodes = nodes, mapData = { floorMeshConfigs }, selectedBuilding = null } = {}) {
  const frames = [];
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const react = { memo: (component) => component };
  const mocks = {
    react: {
      __esModule: true,
      default: react,
      useRef: (current) => ({ current }),
      useMemo: (calculate) => calculate(),
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@react-three/fiber/native': { useFrame: (frame) => frames.push(frame) },
    three: THREE,
    '@/three/models/CampusModel': { useCampusGLTF: () => ({ ...gltf, nodes: modelNodes }) },
    '@/three/store/mapDataStore': { useMapDataStore: (select) => select({ data: mapData }) },
    '@/three/store/mapStore': {
      useMapStore: (select) => select({ selectedBuilding, isExploded: selectedBuilding !== null }),
    },
  };
  const module = { exports: {} };
  const compiled = ts.transpileModule(source, {
    fileName: sourcePath.pathname,
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: (name) => {
      assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency: ${name}`);
      return mocks[name];
    },
  }, { filename: 'CampusModel.tsx' });

  // Materialize the JSX of the real scene and FloorGroup using renderer-side
  // Three. Ref/frame mocks cover its animation without requiring a native GPU.
  function mount(element) {
    if (element == null || element === false) return null;
    if (typeof element.type === 'function') return mount(element.type(element.props));
    const { type, props } = element;
    const object = type === 'primitive' ? props.object
      : type === 'mesh' ? new THREE.Mesh(props.geometry, props.material)
        : new THREE.Group();
    assert.ok(['primitive', 'mesh', 'group'].includes(type), `Unexpected JSX: ${type}`);
    if (props.position) object.position.fromArray(props.position);
    if (props.rotation) object.rotation.set(...props.rotation);
    if (props.scale != null) {
      if (Array.isArray(props.scale)) object.scale.fromArray(props.scale);
      else object.scale.setScalar(props.scale);
    }
    if (props.userData) object.userData = props.userData;
    if (props.ref) props.ref.current = object;
    for (const child of [props.children].flat(Infinity)) {
      const mounted = mount(child);
      if (mounted) object.add(mounted);
    }
    return object;
  }
  const scene = mount(module.exports.CampusModelScene());
  scene.updateMatrixWorld(true);
  return { scene, decoration: scene.children[0], floors: scene.children.slice(1), frames };
}

test('native loader and renderer have distinct Mesh constructors', () => {
  const mesh = Object.values(nodes).find((node) => node.isMesh);
  assert.notEqual(THREE.Mesh, THREE_CJS.Mesh);
  assert.ok(mesh instanceof THREE_CJS.Mesh);
  assert.equal(mesh instanceof THREE.Mesh, false);
  assert.equal(mesh.isMesh, true);
  assert.equal(countMeshes(gltf.scene), 254);
  assert.equal(floorMeshConfigs.length, 36);
  assert.equal(floorMeshConfigs.flatMap((floor) => floor.subMeshes).length, 206);
});

test('real scene reconstructs all floors across Three builds and preserves transforms/cache', () => {
  const { scene, decoration, floors } = renderCampus();
  assert.equal(floors.length, 36);
  assert.equal(countMeshes(decoration), 48);
  assert.equal(countMeshes(scene) - countMeshes(decoration), 206);
  assert.equal(countMeshes(scene), 254);
  assert.equal(countMeshes(gltf.scene), 254, 'useGLTF cache must remain intact');
  assert.equal(floors.filter((floor) => floor.children[0]?.userData.buildingId.startsWith('cabin')).length, 12);

  for (const [index, floor] of floors.entries()) {
    const config = floorMeshConfigs[index];
    assert.equal(floor.children.length, config.subMeshes.length, config.meshName);
    for (const [childIndex, mesh] of floor.children.entries()) {
      const original = nodes[config.subMeshes[childIndex]];
      assert.equal(mesh.geometry, original.geometry);
      assert.equal(mesh.material, original.material);
      assert.equal(mesh.userData.isFloor, true);
      assert.equal(mesh.userData.meshName, config.meshName);
      assert.equal(mesh.userData.buildingId, config.buildingId);
      for (let coordinate = 0; coordinate < 16; coordinate += 1) {
        assert.ok(Math.abs(mesh.matrixWorld.elements[coordinate] - original.matrixWorld.elements[coordinate]) < 1e-9,
          `${config.meshName} world transform ${coordinate}`);
      }
      assert.equal(decoration.getObjectByName(original.name), undefined);
    }
  }
  const tree = decoration.getObjectByName('pine_tree13(easteregg)');
  assert.ok(tree, 'reserved easter egg must remain decoration');
  assert.equal(tree.userData.isFloor, undefined);
  assert.deepEqual(tree.matrixWorld.elements, nodes['pine_tree13(easteregg)'].matrixWorld.elements);
});

test('each cabin exposes its four floors above the walkway without moving other buildings', () => {
  for (const buildingId of Object.values(cabinIds)) {
    const { scene, decoration, floors, frames } = renderCampus({ selectedBuilding: buildingId });
    for (let frame = 0; frame < 240; frame += 1) {
      for (const advance of frames) advance({}, 1 / 60);
    }
    scene.updateMatrixWorld(true);
    const cabin = floors.filter((floor) => floor.children[0]?.userData.buildingId === buildingId);
    assert.equal(cabin.length, 4);
    const bounds = cabin.map((floor) => new THREE.Box3().setFromObject(floor))
      .sort((a, b) => a.min.y - b.min.y);
    for (let index = 1; index < bounds.length; index += 1) {
      assert.ok(bounds[index].min.y - bounds[index - 1].max.y > 0.019,
        `${buildingId} must expose a gap between floors`);
    }
    const walkway = new THREE.Box3().setFromObject(decoration.getObjectByName('cabins_walkway_floor3'));
    assert.ok(bounds[0].min.y > walkway.max.y, `${buildingId} basement must clear walkway`);
    floors.forEach((floor, index) => {
      if (floorMeshConfigs[index].buildingId !== buildingId) {
        assert.deepEqual(floor.position.toArray(), floorMeshConfigs[index].position);
      }
    });
    assert.equal(countMeshes(gltf.scene), 254);
  }
});

test('missing or non-mesh node metadata keeps the unreconstructed mesh visible in decoration', () => {
  const missingName = floorMeshConfigs[0].subMeshes[0];
  for (const replacement of [undefined, new THREE.Group()]) {
    const { scene, decoration } = renderCampus({ modelNodes: { ...nodes, [missingName]: replacement } });
    assert.ok(decoration.getObjectByName(missingName));
    assert.equal(countMeshes(decoration), 49);
    assert.equal(countMeshes(scene) - countMeshes(decoration), 205);
    assert.equal(countMeshes(scene), 254);
    assert.equal(countMeshes(gltf.scene), 254);
  }
});

test('without map metadata the original model remains fully visible', () => {
  const { scene, decoration, floors } = renderCampus({ mapData: null });
  assert.equal(floors.length, 0);
  assert.equal(countMeshes(decoration), 254);
  assert.equal(countMeshes(scene), 254);
  assert.equal(countMeshes(gltf.scene), 254);
});
