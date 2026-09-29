import dns from 'node:dns';

// Workaround limitado a este proceso de seed para entornos locales con problemas
// de resolución SRV. No forma parte de la conexión usada por la API en runtime.
dns.setServers(['1.1.1.1', '8.8.8.8']);

import 'dotenv/config';
import { createHash } from 'node:crypto';
import { MongoClient } from 'mongodb';

import {
  buildingConfigs,
  floorData,
  floorMeshConfigs,
} from '../../frontendclink/src/three/data/floors.ts';

/** Convierte escalas escalares del frontend al vector3 exigido por el schema Mongo. */
function normalizeScale(
  scale: number | [number, number, number] | undefined,
): [number, number, number] {
  if (Array.isArray(scale)) return [...scale] as [number, number, number];
  const value = scale ?? 1;
  return [value, value, value];
}

/**
 * Construye o actualiza una versión de `campus_maps` a partir de la configuración
 * visual actual. Es un proceso offline: usa su propio MongoClient y siempre lo
 * cierra, a diferencia de la API que mantiene un pool durante toda su ejecución.
 *
 * `CAMPUS_ID` debe ser el UUID real de `public.campus.id` en Supabase. MongoDB lo
 * guarda como referencia lógica; ninguna foreign key puede cruzar ambas bases.
 */
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

  // El índice evita búsquedas repetidas al combinar la definición pedagógica de
  // cada piso con su transformación y submeshes dentro del modelo 3D.
  const meshByName = new Map(
    floorMeshConfigs.map((item) => [item.meshName, item]),
  );

  // Traduce la fuente actual del frontend al documento autocontenido que consumirá
  // el backend. El seed es un bootstrap, no una consulta del frontend en runtime.
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

  // La huella permite reconocer con qué versión de la configuración visual se
  // generó el documento, sin almacenar ni comparar manualmente todos los archivos.
  const sourceHash = createHash('sha256')
    .update(JSON.stringify({ buildingConfigs, floorData, floorMeshConfigs }))
    .digest('hex');

  const now = new Date();
  const client = new MongoClient(uri);

  try {
    await client.connect();

    const db = client.db(dbName);
    const collection = db.collection('campus_maps');

    // Conserva los POIs al reejecutar la misma versión para no destruir datos que
    // pudieron agregarse después del bootstrap inicial del mapa.
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

    // `schemaVersion` versiona la forma del documento; `version` identifica una
    // edición del mapa. Las rutas del modelo son metadatos, no archivos en MongoDB.
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
      // Antes de activar esta versión se archivan las anteriores. Esto mantiene el
      // contrato de un único mapa ACTIVE respaldado también por un índice parcial.
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

    // El upsert hace al seed repetible por campus+versión. `createdAt` se fija solo
    // al insertar; las siguientes ejecuciones actualizan contenido y `updatedAt`.
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
