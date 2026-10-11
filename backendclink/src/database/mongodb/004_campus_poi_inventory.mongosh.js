// Manual inventory for GH-46 / F2.1-05. NOT a startup migration.
// Run in mongosh / Compass shell, after selecting the existing database.
// Preview by default; set globalThis.POI_INVENTORY_APPLY = true to write.
// Only updates campus_maps; never creates collections, maps, buildings or floors.
(() => {
  const campusId = globalThis.POI_INVENTORY_CAMPUS_ID ?? '22222222-2222-4222-8222-222222222222';
  const apply = globalThis.POI_INVENTORY_APPLY === true;
  const inventory = [
    {
      "buildingId": "hbuilding",
      "buildingName": "Edificio H",
      "level": 1,
      "pois": [
        {
          "poiKey": "hbuilding-floor1-auditorio",
          "name": "Auditorio",
          "type": "AUDITORIUM",
          "icon": "auditorium",
          "description": "Auditorio. Edificio H, Piso 1.",
          "imageKeys": [
            "hbuilding-floor1-auditorio.jpg"
          ]
        },
        {
          "poiKey": "hbuilding-floor1-casino",
          "name": "Casino",
          "type": "CAFETERIA",
          "icon": "restaurant",
          "description": "Comedor ubicado en Edificio H, Piso 1.",
          "imageKeys": [
            "hbuilding-floor1-casino.jpg"
          ]
        }
      ]
    },
    {
      "buildingId": "hbuilding",
      "buildingName": "Edificio H",
      "level": 2,
      "pois": [
        {
          "poiKey": "hbuilding-floor2-biblioteca",
          "name": "Biblioteca",
          "type": "LIBRARY",
          "icon": "local-library",
          "description": "Biblioteca. Edificio H, Piso 2.",
          "imageKeys": [
            "hbuilding-floor2-biblioteca.jpg"
          ]
        }
      ]
    },
    {
      "buildingId": "hbuilding",
      "buildingName": "Edificio H",
      "level": 3,
      "pois": []
    },
    {
      "buildingId": "hbuilding",
      "buildingName": "Edificio H",
      "level": 4,
      "pois": [
        {
          "poiKey": "hbuilding-floor4-cetecom",
          "name": "Cetecom",
          "type": "OTHER",
          "icon": "info",
          "description": "Cetecom. Edificio H, Piso 4.",
          "imageKeys": [
            "hbuilding-floor4-cetecom.jpg"
          ]
        }
      ]
    },
    {
      "buildingId": "hbuilding",
      "buildingName": "Edificio H",
      "level": 5,
      "pois": []
    },
    {
      "buildingId": "hbuilding",
      "buildingName": "Edificio H",
      "level": 6,
      "pois": []
    },
    {
      "buildingId": "hbuilding",
      "buildingName": "Edificio H",
      "level": 7,
      "pois": []
    },
    {
      "buildingId": "hbuilding",
      "buildingName": "Edificio H",
      "level": 8,
      "pois": []
    },
    {
      "buildingId": "dbuilding",
      "buildingName": "Edificio D",
      "level": 1,
      "pois": []
    },
    {
      "buildingId": "ebuilding",
      "buildingName": "Edificio E",
      "level": 1,
      "pois": [
        {
          "poiKey": "ebuilding-floor1-caja-de-pago",
          "name": "Caja de pago",
          "type": "SERVICE",
          "icon": "payments",
          "description": "Caja de pago. Edificio E, Piso 1.",
          "imageKeys": [
            "ebuilding-floor1-caja-de-pago.jpg"
          ]
        }
      ]
    },
    {
      "buildingId": "ebuilding",
      "buildingName": "Edificio E",
      "level": 2,
      "pois": []
    },
    {
      "buildingId": "ebuilding",
      "buildingName": "Edificio E",
      "level": 3,
      "pois": []
    },
    {
      "buildingId": "ebuilding",
      "buildingName": "Edificio E",
      "level": 4,
      "pois": []
    },
    {
      "buildingId": "ebuilding",
      "buildingName": "Edificio E",
      "level": 5,
      "pois": []
    },
    {
      "buildingId": "fbuilding",
      "buildingName": "Edificio F",
      "level": 1,
      "pois": [
        {
          "poiKey": "fbuilding-floor1-capilla",
          "name": "Capilla",
          "type": "CHAPEL",
          "icon": "church",
          "description": "Capilla. Edificio F, Piso 1.",
          "imageKeys": [
            "fbuilding-floor1-capilla.jpg"
          ]
        }
      ]
    },
    {
      "buildingId": "fbuilding",
      "buildingName": "Edificio F",
      "level": 2,
      "pois": [
        {
          "poiKey": "fbuilding-floor2-casino",
          "name": "Casino",
          "type": "CAFETERIA",
          "icon": "restaurant",
          "description": "Comedor ubicado en Edificio F, Piso 2.",
          "imageKeys": [
            "fbuilding-floor2-casino.jpg"
          ]
        }
      ]
    },
    {
      "buildingId": "fbuilding",
      "buildingName": "Edificio F",
      "level": 3,
      "pois": [
        {
          "poiKey": "fbuilding-floor3-cetecom",
          "name": "Cetecom",
          "type": "OTHER",
          "icon": "info",
          "description": "Cetecom. Edificio F, Piso 3.",
          "imageKeys": [
            "fbuilding-floor3-cetecom.jpg"
          ]
        },
        {
          "poiKey": "fbuilding-floor3-central-de-apuntes",
          "name": "Central de apuntes",
          "type": "SERVICE",
          "icon": "description",
          "description": "Central de apuntes. Edificio F, Piso 3.",
          "imageKeys": [
            "fbuilding-floor3-central-de-apuntes.jpg"
          ]
        }
      ]
    },
    {
      "buildingId": "fbuilding",
      "buildingName": "Edificio F",
      "level": 4,
      "pois": [
        {
          "poiKey": "fbuilding-floor4-terraza",
          "name": "Terraza",
          "type": "OTHER",
          "icon": "deck",
          "description": "Terraza. Edificio F, Piso 4.",
          "imageKeys": [
            "fbuilding-floor4-terraza.jpg"
          ]
        }
      ]
    },
    {
      "buildingId": "gbuilding",
      "buildingName": "Edificio G",
      "level": 1,
      "pois": []
    },
    {
      "buildingId": "gbuilding",
      "buildingName": "Edificio G",
      "level": 2,
      "pois": []
    },
    {
      "buildingId": "gbuilding",
      "buildingName": "Edificio G",
      "level": 3,
      "pois": []
    },
    {
      "buildingId": "gbuilding",
      "buildingName": "Edificio G",
      "level": 4,
      "pois": []
    },
    {
      "buildingId": "cabin03",
      "buildingName": "Cabaña 3",
      "level": 1,
      "pois": []
    },
    {
      "buildingId": "cabin03",
      "buildingName": "Cabaña 3",
      "level": 2,
      "pois": [
        {
          "poiKey": "cabin03-floor2-ciit",
          "name": "CIIT",
          "type": "OTHER",
          "icon": "info",
          "description": "CIIT. Cabaña 3, Piso 2.",
          "imageKeys": [
            "cabin03-floor2-ciit.jpg"
          ]
        }
      ]
    },
    {
      "buildingId": "cabin03",
      "buildingName": "Cabaña 3",
      "level": 3,
      "pois": [
        {
          "poiKey": "cabin03-floor3-punto-estudiantil",
          "name": "Punto estudiantil",
          "type": "SERVICE",
          "icon": "groups",
          "description": "Punto estudiantil. Cabaña 3, Piso 3.",
          "imageKeys": [
            "cabin03-floor3-punto-estudiantil.jpg"
          ]
        },
        {
          "poiKey": "cabin03-floor3-radio",
          "name": "Radio",
          "type": "OTHER",
          "icon": "radio",
          "description": "Radio. Cabaña 3, Piso 3.",
          "imageKeys": [
            "cabin03-floor3-radio.jpg"
          ]
        }
      ]
    },
    {
      "buildingId": "cabin02",
      "buildingName": "Cabaña 2",
      "level": 1,
      "pois": []
    },
    {
      "buildingId": "cabin02",
      "buildingName": "Cabaña 2",
      "level": 2,
      "pois": []
    },
    {
      "buildingId": "cabin02",
      "buildingName": "Cabaña 2",
      "level": 3,
      "pois": []
    },
    {
      "buildingId": "cabin01",
      "buildingName": "Cabaña 1",
      "level": 1,
      "pois": []
    },
    {
      "buildingId": "cabin01",
      "buildingName": "Cabaña 1",
      "level": 2,
      "pois": []
    },
    {
      "buildingId": "cabin01",
      "buildingName": "Cabaña 1",
      "level": 3,
      "pois": []
    },
    {
      "buildingId": "cti",
      "buildingName": "CTI",
      "level": 1,
      "pois": []
    },
    {
      "buildingId": "gym",
      "buildingName": "Gimnasio",
      "level": 1,
      "pois": [
        {
          "poiKey": "gym-floor1-multicancha",
          "name": "Multicancha",
          "type": "SPORTS",
          "icon": "sports-basketball",
          "description": "Multicancha. Gimnasio, Piso 1.",
          "imageKeys": [
            "gym-floor1-multicancha.jpg"
          ]
        },
        {
          "poiKey": "gym-floor1-sala-de-musculacion",
          "name": "Sala de musculación",
          "type": "SPORTS",
          "icon": "fitness-center",
          "description": "Sala de musculación. Gimnasio, Piso 1.",
          "imageKeys": [
            "gym-floor1-sala-de-musculacion.jpg"
          ]
        }
      ]
    }
  ];
  const fail = (message) => { throw new Error(message); };
  const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const validPosition = (position) => position && ['x', 'y', 'z'].every((axis) =>
    typeof position[axis] === 'number' && Number.isFinite(position[axis]));

  if (typeof campusId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campusId)) {
    fail('POI_INVENTORY_CAMPUS_ID must be the existing campus UUID.');
  }
  if (!db.getCollectionNames().includes('campus_maps')) fail('campus_maps must already exist.');
  const collection = db.getCollection('campus_maps');
  const maps = collection.find({ campusId, status: 'ACTIVE' }).limit(2).toArray();
  if (maps.length !== 1) fail('Expected exactly one ACTIVE map for the selected campus.');
  const map = maps[0];
  if (map.deletedAt || !Array.isArray(map.buildings)) fail('Map is inactive or malformed.');

  // Preflight the complete document before preparing any write. No guessed indices.
  const keys = new Map();
  const buildingIds = new Set();
  for (const building of map.buildings) {
    if (!building || typeof building.id !== 'string' || buildingIds.has(building.id)
      || !Array.isArray(building.floors)) fail('Malformed/duplicate building.');
    buildingIds.add(building.id);
    const floorIds = new Set();
    const levels = new Set();
    for (const floor of building.floors) {
      if (!floor || typeof floor.id !== 'string' || floorIds.has(floor.id)
        || !Number.isInteger(floor.level) || levels.has(floor.level)
        || (floor.pois !== undefined && !Array.isArray(floor.pois))) fail('Malformed/duplicate floor.');
      floorIds.add(floor.id);
      levels.add(floor.level);
      for (const poi of floor.pois ?? []) {
        if (!poi || typeof poi.poiKey !== 'string' || !poi.poiKey.trim()
          || typeof poi.name !== 'string' || keys.has(poi.poiKey)) fail('Malformed/duplicate POI identity.');
        keys.set(poi.poiKey, { buildingId: building.id, floorId: floor.id });
      }
    }
  }

  const now = new Date();
  const changes = [];
  const set = {};
  for (const entry of inventory) {
    const buildingIndex = map.buildings.findIndex((building) => building.id === entry.buildingId);
    if (buildingIndex < 0) fail('Missing building: ' + entry.buildingId);
    const building = map.buildings[buildingIndex];
    const floorIndex = building.floors.findIndex((floor) => floor.level === entry.level);
    if (floorIndex < 0) fail('Missing floor: ' + entry.buildingId + ' / ' + entry.level);
    const floor = building.floors[floorIndex];
    if (building.deletedAt || building.isVisible === false || floor.deletedAt || floor.isVisible === false) {
      fail('Target building/floor is inactive: ' + entry.buildingId + ' / ' + entry.level);
    }
    const before = floor.pois ?? [];
    const next = before.map((poi) => ({ ...poi }));
    const details = { building: entry.buildingName, level: entry.level, floorId: floor.id,
      inserted: [], updated: [], deactivated: [], preservedExtra: [] };

    if (entry.pois.length === 0) {
      // Explicit user decision: "Nada" means zero visible POI; preserve all records.
      for (let index = 0; index < next.length; index++) {
        if (next[index].isVisible !== false) {
          next[index] = { ...next[index], isVisible: false, updatedAt: now };
          details.deactivated.push(next[index].poiKey);
        }
      }
    } else {
      const matched = new Set();
      for (const spec of entry.pois) {
        const owner = keys.get(spec.poiKey);
        if (owner && (owner.buildingId !== building.id || owner.floorId !== floor.id)) {
          fail('Inventory key belongs to another location: ' + spec.poiKey);
        }
        const matches = next.map((poi, index) => ({ poi, index })).filter(({ poi }) =>
          poi.poiKey === spec.poiKey || normalize(poi.name) === normalize(spec.name));
        if (matches.length > 1) fail('Ambiguous existing POI: ' + spec.poiKey);
        if (matches.length === 0) {
          // Coordinates deliberately provisional; do not use for individual 3D markers yet.
          next.push({ ...spec, position: { x: 0, y: 0, z: 0 }, positionPending: true,
            isFixed: true, isVisible: true, createdAt: now, updatedAt: now });
          keys.set(spec.poiKey, { buildingId: building.id, floorId: floor.id });
          matched.add(spec.poiKey);
          details.inserted.push(spec.poiKey);
          continue;
        }
        const { poi, index } = matches[0];
        if (poi.deletedAt) fail('POI is logically deleted; review manually: ' + poi.poiKey);
        if (!validPosition(poi.position)) fail('Existing POI has invalid coordinates: ' + poi.poiKey);
        if (poi.imageKeys !== undefined && (!Array.isArray(poi.imageKeys)
          || poi.imageKeys.some((key) => typeof key !== 'string'))) fail('Invalid imageKeys: ' + poi.poiKey);
        // Match by key OR unambiguous name within this floor. Never rename historical keys.
        const candidate = { ...poi, name: spec.name, isVisible: true,
          type: poi.type || spec.type, icon: poi.icon || spec.icon,
          description: poi.description || spec.description,
          imageKeys: [...new Set([...(poi.imageKeys ?? []), ...spec.imageKeys])] };
        if (JSON.stringify(candidate) !== JSON.stringify(poi)) {
          next[index] = { ...candidate, updatedAt: now };
          details.updated.push(poi.poiKey);
        }
        matched.add(poi.poiKey);
      }
      details.preservedExtra = before.filter((poi) => !matched.has(poi.poiKey)).map((poi) => poi.poiKey);
    }

    if (JSON.stringify(before) !== JSON.stringify(next)) {
      set['buildings.' + buildingIndex + '.floors.' + floorIndex + '.pois'] = next;
    }
    changes.push(details);
  }
  print(JSON.stringify({ mode: apply ? 'APPLY' : 'PREVIEW', database: db.getName(), campusId,
    mapId: String(map._id), inventoryFloors: inventory.length,
    inventoryPois: inventory.reduce((count, entry) => count + entry.pois.length, 0), changes }, null, 2));
  if (!Object.keys(set).length) { print('Inventory already applied. No changes.'); return; }
  if (!apply) { print('Preview only. Set POI_INVENTORY_APPLY = true and load again to apply.'); return; }

  set.updatedAt = now;
  // One atomic write; compare the original hierarchy to reject concurrent edits.
  const result = collection.updateOne(
    { _id: map._id, campusId, status: 'ACTIVE', buildings: map.buildings,
      deletedAt: map.deletedAt ?? null },
    { $set: set },
    { upsert: false },
  );
  if (result.matchedCount !== 1) fail('Map changed during preflight. Reload preview; no changes applied.');
  if (result.modifiedCount !== 1) fail('Mongo did not report the expected modification.');
  print('Inventory applied to existing map. Reload the app to refresh the cached map.');
})();
