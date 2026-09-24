import dns from 'node:dns';

dns.setServers(['1.1.1.1', '8.8.8.8']);

import 'dotenv/config';
import { createHash } from 'node:crypto';
import { MongoClient } from 'mongodb';

import {
  buildingConfigs,
  floorData,
  floorMeshConfigs,
} from '../../frontendclink/src/three/data/floors.ts';

function normalizeScale(
  scale: number | [number, number, number] | undefined,
): [number, number, number] {
  if (Array.isArray(scale)) return [...scale] as [number, number, number];
  const value = scale ?? 1;
  return [value, value, value];
}

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME ?? 'campuslink';
  const campusId = process.env.CAMPUS_ID;
  const version = Number(process.env.MAP_VERSION ?? 1);
  const status = (process.env.MAP_STATUS ?? 'ACTIVE') as
    | 'DRAFT'
    | 'ACTIVE'
    | 'ARCHIVED';

  if (!uri) throw new Error('MONGODB_URI is required');
  if (!campusId) {
    throw new Error('CAMPUS_ID (UUID from public.campus.id) is required');
  }
  if (!Number.isInteger(version) || version < 1) {
    throw new Error('MAP_VERSION must be a positive integer');
  }
  if (!['DRAFT', 'ACTIVE', 'ARCHIVED'].includes(status)) {
    throw new Error('MAP_STATUS must be DRAFT, ACTIVE or ARCHIVED');
  }

  const meshByName = new Map(
    floorMeshConfigs.map((item) => [item.meshName, item]),
  );

  function buildBuildings() {
    return Object.values(buildingConfigs).map((building) => ({
      id: building.id,
      name: building.name,
      focusTarget: [...building.focusTarget],
      focusPosition: [...building.focusPosition],
      floors: building.floors.map((floorId) => {
        const definition = floorData[floorId];
        const mesh = meshByName.get(floorId);

        if (!definition || !mesh) {
          throw new Error(`Missing floor data/config for ${floorId}`);
        }

        return {
          id: definition.id,
          level: definition.level,
          meshName: definition.meshName,
          name: definition.name,
          description: definition.description,
          transform: {
            position: [...mesh.position],
            rotation: [...(mesh.rotation ?? [0, 0, 0])],
            scale: normalizeScale(mesh.scale),
          },
          subMeshes: [...mesh.subMeshes],
          pois: [],
        };
      }),
    }));
  }

  const sourceHash = createHash('sha256')
    .update(JSON.stringify({ buildingConfigs, floorData, floorMeshConfigs }))
    .digest('hex');

  const now = new Date();
  const client = new MongoClient(uri);

  try {
    await client.connect();

    const db = client.db(dbName);
    const collection = db.collection('campus_maps');

    // Conserva POIs si se vuelve a ejecutar el seed para la misma versiÃ³n.
    const existing = await collection.findOne({ campusId, version });
    const existingPois = new Map<string, unknown[]>();

    for (const building of existing?.buildings ?? []) {
      for (const floor of building.floors ?? []) {
        existingPois.set(floor.id, floor.pois ?? []);
      }
    }

    const buildings = buildBuildings().map((building) => ({
      ...building,
      floors: building.floors.map((floor) => ({
        ...floor,
        pois: existingPois.get(floor.id) ?? [],
      })),
    }));

    const document = {
      campusId,
      version,
      schemaVersion: 1,
      status,
      model: {
        key: 'campus-main',
        assetPath: 'frontendclink/assets/models/modelomejoradojunto.glb',
        dataSource: 'frontendclink/src/three/data/floors.ts',
        sourceHash,
      },
      buildings,
      updatedAt: now,
      activatedAt: status === 'ACTIVE' ? now : null,
      archivedAt: status === 'ARCHIVED' ? now : null,
    };

    if (status === 'ACTIVE') {
      await collection.updateMany(
        { campusId, status: 'ACTIVE', version: { $ne: version } },
        {
          $set: {
            status: 'ARCHIVED',
            archivedAt: now,
            updatedAt: now,
          },
        },
      );
    }

    await collection.updateOne(
      { campusId, version },
      {
        $set: document,
        $setOnInsert: { createdAt: existing?.createdAt ?? now },
      },
      { upsert: true },
    );

    const floorCount = buildings.reduce(
      (sum, building) => sum + building.floors.length,
      0,
    );

    console.log(
      `Seeded campus map: ${buildings.length} buildings, ${floorCount} floors, version ${version}, status ${status}`,
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error('Failed to seed campus map:');
  console.error(error);
  process.exitCode = 1;
});