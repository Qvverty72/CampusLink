// GH-35 / F2.1-01: integra el cuarto piso de las cabañas en el mapa existente.
// Ejecutar manualmente en mongosh/Compass sobre la base existente, con respaldo previo.
// Preview por defecto; CABIN_BASEMENT_APPLY = true habilita una única escritura atómica.
// No crea colecciones/versiones ni modifica actividades, participaciones o claves históricas.
(() => {
  const campusId = globalThis.CABIN_BASEMENT_CAMPUS_ID ?? '22222222-2222-4222-8222-222222222222';
  const apply = globalThis.CABIN_BASEMENT_APPLY === true;
  // Posiciones originales del GLB 2026-10-20. A/B/C conservan IDs cabin03/02/01.
  const cabins = [
    { id: 'cabin01', focusTarget: [0.097317, 0.171695, 0.102494],
      focusPosition: [0.271644, 0.300446, 0.273402], positions: [
      [0.09646709263324738, 0.052622437477111816, 0.09935502707958221],
      [0.09683655947446823, 0.06523443013429642, 0.09987102448940277],
      [0.09683655947446823, 0.07815167307853699, 0.09987102448940277],
      [0.09699229896068573, 0.09544790536165237, 0.10072065144777298],
    ] },
    { id: 'cabin02', focusTarget: [0.173667, 0.172165, 0.062088],
      focusPosition: [0.380998, 0.321391, 0.269419], positions: [
      [0.17303058505058289, 0.05269080400466919, 0.06310653686523438],
      [0.17350293695926666, 0.06532427668571472, 0.06341652572154999],
      [0.17350293695926666, 0.07816780358552933, 0.06341652572154999],
      [0.17356263101100922, 0.09600328654050827, 0.06293174624443054],
    ] },
    { id: 'cabin03', focusTarget: [0.217783, 0.172769, -0.002321],
      focusPosition: [0.428896, 0.320027, 0.194457], positions: [
      [0.21857939660549164, 0.052605241537094116, -0.001658343244343996],
      [0.21857939660549164, 0.0654091015458107, -0.001658343244343996],
      [0.21857939660549164, 0.07817550003528595, -0.001658343244343996],
      [0.21828731894493103, 0.09617037326097488, -0.001901398180052638],
    ] },
  ];
  // Resto de los pisos del mismo export; CTI y G también cambiaron de transform.
  // [meshName, posición, base de submallas, cantidad de primitivas]
  const otherFloors = [
    ['cti_floor1', [-0.0917966291308403, 0.005035744979977608, 0.43425723910331726], 'cti_floor1_Mesh001', 8],
    ['dbuilding_floor1', [0.016933834180235863, 0.09075969457626343, 0.0655309334397316], 'dbuilding_floor1_Mesh', 6],
    ['ebuilding_floor1', [0.01866287551820278, 0.09097073972225189, -0.07101801782846451], 'ebuilding_floor1_Mesh001', 6],
    ['ebuilding_floor2', [0.018898051232099533, 0.10393096506595612, -0.07490822672843933], 'ebuilding_floor2_Mesh001', 6],
    ['ebuilding_floor3', [0.018898051232099533, 0.11693096160888672, -0.07490823417901993], 'ebuilding_floor3_Mesh001', 6],
    ['ebuilding_floor4', [0.018898049369454384, 0.12993095815181732, -0.07490823417901993], 'ebuilding_floor4_Mesh001', 6],
    ['ebuilding_floor5', [0.02078407071530819, 0.14320296049118042, -0.07352281361818314], 'ebuilding_floor5_Mesh001', 5],
    ['fbuilding_floor1', [0.07641956210136414, 0.09085523337125778, -0.06767353415489197], 'fbuilding_floor1_Mesh', 6],
    ['fbuilding_floor2', [0.07634685933589935, 0.10385523736476898, -0.06772477924823761], 'fbuilding_floor2_Mesh', 6],
    ['fbuilding_floor3', [0.07634706050157547, 0.11685523390769958, -0.06772463768720627], 'fbuilding_floor3_Mesh', 6],
    ['fbuilding_floor4', [0.07634293287992477, 0.1298552304506302, -0.06772753596305847], 'fbuilding_floor4_Mesh', 6],
    ['gbuilding_floor1', [0.08067817986011505, 0.09105546772480011, -0.11651501059532166], 'gbuilding_floor1_Mesh', 6],
    ['gbuilding_floor2', [0.08060405403375626, 0.10405545681715012, -0.11656434088945389], 'gbuilding_floor2_Mesh', 6],
    ['gbuilding_floor3', [0.08060426265001297, 0.11705545336008072, -0.11656420677900314], 'gbuilding_floor3_Mesh', 6],
    ['gbuilding_floor4', [0.08060005307197571, 0.13005545735359192, -0.11656715720891953], 'gbuilding_floor4_Mesh', 6],
    ['gym_floor1', [0.45241209864616394, 0.003408252028748393, 0.40112870931625366], 'gym_floor1_Mesh001', 8],
    ['hbuilding_floor1', [0.04087867587804794, -0.00003838145494228229, 0.21824084222316742], 'hbuilding_floor1_Mesh', 5],
    ['hbuilding_floor2', [0.04087868705391884, 0.012961619533598423, 0.2182408571243286], 'hbuilding_floor2_Mesh', 5],
    ['hbuilding_floor3', [0.04239637404680252, 0.02602829597890377, 0.221948504447937], 'hbuilding_floor3_Mesh', 6],
    ['hbuilding_floor4', [0.04328106716275215, 0.03902829810976982, 0.22180475294589996], 'hbuilding_floor4_Mesh', 6],
    ['hbuilding_floor5', [0.043281085789203644, 0.05202829837799072, 0.22180475294589996], 'hbuilding_floor5_Mesh', 6],
    ['hbuilding_floor6', [0.04294845834374428, 0.0653560608625412, 0.22161678969860077], 'hbuilding_floor6_Mesh', 6],
    ['hbuilding_floor7', [0.053043216466903687, 0.0780392438173294, 0.20925535261631012], 'hbuilding_floor7_Mesh', 5],
    ['hbuilding_floor8', [0.04476763680577278, 0.09105213731527328, 0.17216941714286804], 'hbuilding_floor8_Mesh', 5],
  ];
  const fail = (message) => { throw new Error(message); };
  const meshParts = (base, count) => Array.from({ length: count }, (_, index) =>
    base + (index ? '_' + index : ''));
  const validVector = (value) => Array.isArray(value) && value.length === 3
    && value.every((component) => typeof component === 'number' && Number.isFinite(component));
  // Solo corrige la mención del piso físico reclasificado; conserva el resto del texto.
  const updateDescription = (value, oldLevel, level) => typeof value === 'string'
    ? value.replace(new RegExp('\\b(Piso\\s*)[-−]\\s*' + Math.abs(oldLevel) + '(?!\\d)', 'gi'),
      (_match, prefix) => prefix + level)
    : value;

  if (typeof campusId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campusId)) {
    fail('CABIN_BASEMENT_CAMPUS_ID must be the existing campus UUID.');
  }
  if (!db.getCollectionNames().includes('campus_maps')) fail('campus_maps must already exist.');
  const collection = db.getCollection('campus_maps');
  const maps = collection.find({ campusId, status: 'ACTIVE' }).limit(2).toArray();
  if (maps.length !== 1) fail('Expected exactly one ACTIVE map for the selected campus.');
  const map = maps[0];
  if (map.deletedAt || !Array.isArray(map.buildings)) fail('Map is inactive or malformed.');

  const buildingIds = new Set();
  const meshNames = new Set();
  for (const building of map.buildings) {
    if (!building || typeof building.id !== 'string' || buildingIds.has(building.id)
      || !Array.isArray(building.floors)) fail('Malformed/duplicate building.');
    buildingIds.add(building.id);
    const floorIds = new Set();
    for (const floor of building.floors) {
      if (!floor || typeof floor.id !== 'string' || !floor.id || floorIds.has(floor.id)
        || typeof floor.meshName !== 'string' || meshNames.has(floor.meshName)
        || !Number.isInteger(floor.level) || !Array.isArray(floor.subMeshes)
        || (floor.pois !== undefined && !Array.isArray(floor.pois))) fail('Malformed/duplicate floor.');
      floorIds.add(floor.id);
      meshNames.add(floor.meshName);
    }
  }

  const set = {};
  const changes = [];
  for (const cabin of cabins) {
    const buildingIndex = map.buildings.findIndex((building) => building.id === cabin.id);
    if (buildingIndex < 0) fail('Missing cabin: ' + cabin.id);
    const building = map.buildings[buildingIndex];
    if (typeof building.name !== 'string' || building.deletedAt || building.isVisible === false
      || ![3, 4].includes(building.floors.length)) fail('Inactive/unexpected cabin: ' + cabin.id);
    const definitions = [
      { suffix: '_floor-3', level: -3, base: '_floor1_Mesh002', count: 5 },
      { suffix: '_floor1', level: -2, legacyLevel: 1, oldDisplayLevel: -3, base: '_floor1_Mesh001', count: 5 },
      { suffix: '_floor2', level: -1, legacyLevel: 2, oldDisplayLevel: -2, base: '_floor1_Mesh', count: 5 },
      { suffix: '_floor3', level: 1, legacyLevel: 3, base: '_floor2_Mesh', count: 6 },
    ];
    const next = definitions.map((definition, index) => {
      const meshName = cabin.id + definition.suffix;
      const existing = building.floors.find((floor) => floor.meshName === meshName);
      const subMeshes = meshParts(cabin.id + definition.base, definition.count);
      if (!existing && index !== 0) fail('Missing historical floor: ' + meshName);
      if (!existing && (building.floors.some((floor) => floor.id === meshName) || meshNames.has(meshName))) {
        fail('New basement identity is already in use: ' + meshName);
      }
      if (existing && (existing.deletedAt || existing.isVisible === false
        || ![definition.level, definition.legacyLevel].includes(existing.level)
        || !validVector(existing.transform?.position)
        || JSON.stringify(existing.subMeshes) !== JSON.stringify(subMeshes))) {
        fail('Historical floor does not match the reviewed GLB: ' + meshName);
      }
      const floor = existing ?? {
        id: meshName, meshName, description: 'Piso -3 de ' + building.name + '.', pois: [],
      };
      const candidate = {
        ...floor,
        level: definition.level,
        name: building.name + ' - Piso ' + definition.level,
        transform: {
          ...floor.transform,
          position: cabin.positions[index], rotation: [0, 0, 0], scale: [1, 1, 1],
        },
        subMeshes,
      };
      if (existing && existing.level === definition.legacyLevel && definition.oldDisplayLevel) {
        if (typeof existing.description === 'string') {
          candidate.description = updateDescription(existing.description, definition.oldDisplayLevel, definition.level);
        }
        if (existing.pois) candidate.pois = existing.pois.map((poi) => {
          if (!poi || typeof poi !== 'object' || Array.isArray(poi)) fail('Malformed cabin POI: ' + meshName);
          return typeof poi.description === 'string'
            ? { ...poi, description: updateDescription(poi.description, definition.oldDisplayLevel, definition.level) }
            : poi;
        });
      }
      return candidate;
    });
    if (building.floors.some((floor) => !next.some((item) => item.id === floor.id))) {
      fail('Unexpected floor would lose its identity: ' + cabin.id);
    }
    if (JSON.stringify(building.floors) !== JSON.stringify(next)) {
      set['buildings.' + buildingIndex + '.floors'] = next;
    }
    // Encuadre calculado para cuatro niveles desplegados, FOV50 y pantalla9:16.
    for (const field of ['focusTarget', 'focusPosition']) {
      if (JSON.stringify(building[field]) !== JSON.stringify(cabin[field])) {
        set['buildings.' + buildingIndex + '.' + field] = cabin[field];
      }
    }
    changes.push({ buildingId: cabin.id, buildingName: building.name,
      newBasement: !building.floors.some((floor) => floor.meshName === cabin.id + '_floor-3'),
      floors: next.map((floor) => ({ id: floor.id, meshName: floor.meshName, level: floor.level, name: floor.name })) });
  }
  const transformedFloors = [];
  for (const [meshName, position, subMeshBase, count] of otherFloors) {
    const buildingIndex = map.buildings.findIndex((building) => building.id === meshName.split('_')[0]);
    if (buildingIndex < 0) fail('Missing building for GLB floor: ' + meshName);
    const floorIndex = map.buildings[buildingIndex].floors.findIndex((floor) => floor.meshName === meshName);
    const floor = map.buildings[buildingIndex].floors[floorIndex];
    if (!floor || !validVector(floor.transform?.position)
      || JSON.stringify(floor.subMeshes) !== JSON.stringify(meshParts(subMeshBase, count))) {
      fail('Historical floor does not match the reviewed GLB: ' + meshName);
    }
    const transform = { ...floor.transform, position, rotation: [0, 0, 0], scale: [1, 1, 1] };
    if (JSON.stringify(floor.transform) !== JSON.stringify(transform)) {
      set['buildings.' + buildingIndex + '.floors.' + floorIndex + '.transform'] = transform;
      transformedFloors.push(meshName);
    }
  }
  const ctiIndex = map.buildings.findIndex((building) => building.id === 'cti');
  const ctiFocus = { focusTarget: [-0.093807, 0.002630, 0.433844],
    focusPosition: [0.198485, 0.223372, 0.686556] };
  for (const field of ['focusTarget', 'focusPosition']) {
    if (JSON.stringify(map.buildings[ctiIndex][field]) !== JSON.stringify(ctiFocus[field])) {
      set['buildings.' + ctiIndex + '.' + field] = ctiFocus[field];
    }
  }
  print(JSON.stringify({ mode: apply ? 'APPLY' : 'PREVIEW', database: db.getName(), campusId,
    mapId: String(map._id), version: map.version, changes, transformedFloors }, null, 2));
  if (!Object.keys(set).length) { print('Cabin basements already applied. No changes.'); return; }
  if (!apply) { print('Preview only. Back up the map, set CABIN_BASEMENT_APPLY = true and load again to apply.'); return; }

  set.updatedAt = new Date();
  const result = collection.updateOne(
    { _id: map._id, campusId, status: 'ACTIVE', version: map.version,
      buildings: map.buildings, deletedAt: map.deletedAt ?? null },
    { $set: set },
    { upsert: false },
  );
  if (result.matchedCount !== 1) fail('Map changed during preflight. Reload preview; no changes applied.');
  if (result.modifiedCount !== 1) fail('Mongo did not report the expected modification.');
  print('Cabin basements applied to the existing map. Reload the app to refresh its cached map.');
})();
