import { createModuleHealthCheck } from '../../services/module-health.js';
import type { DependencyChecks } from '../../types/api.types.js';
import type { CampusMapDocument, MapHealth } from './map.types.js';
import type { CampusMapChanges, MapRepository, NewCampusMap } from './map.types.js';
import type { ObjectId } from 'mongodb';
import { ApiError } from '../../services/apiError.js';
import { createReferenceValidator, referenceUuid, type ReferenceValidator } from '../../services/references.js';
import { documentObjectId, documentOperation } from '../../services/document-references.js';

export type ActiveMapLookup = (
  campusId: string,
) => Promise<CampusMapDocument | null>;

async function probeMapDependencies(): Promise<DependencyChecks> {
  const { probeMapDependencies: probe } = await import('./map.repository.js');
  return probe();
}

export const getMapHealth: () => Promise<MapHealth> = createModuleHealthCheck('maps', probeMapDependencies);

const defaultRepository: MapRepository = {
  findActiveMapByCampusId: async id => (await import('./map.repository.js')).findActiveMapByCampusId(id),
  findMapById: async (id, campus) => (await import('./map.repository.js')).findMapById(id, campus),
  insertMap: async document => (await import('./map.repository.js')).insertMap(document),
  updateMap: async (id, campus, changes) => (await import('./map.repository.js')).updateMap(id, campus, changes),
};

export function createMapService(repository: MapRepository = defaultRepository,
  references: ReferenceValidator = createReferenceValidator()) {
  async function getActiveMap(campusId: string): Promise<CampusMapDocument | null> {
    const campus = referenceUuid(campusId, 'campusId');
    if (!await references.areReferencesCurrent({ campusId: campus })) return null;
    const map = await documentOperation(() => repository.findActiveMapByCampusId(campus));
    if (!map || map.status !== 'ACTIVE' || map.campusId !== campus) return null;
    // Recheck after MongoDB I/O; a campus deactivated during the read must not be returned.
    return await references.areReferencesCurrent({ campusId: map.campusId }) ? map : null;
  }

  async function createMap(input: NewCampusMap): Promise<CampusMapDocument> {
    const campusId = referenceUuid(input.campusId, 'campusId');
    validateStatus(input.status);
    const now = new Date();
    const document = { campusId, version: input.version, schemaVersion: input.schemaVersion,
      status: input.status, model: input.model, buildings: input.buildings,
      activatedAt: input.activatedAt ?? null, archivedAt: input.archivedAt ?? null,
      createdAt: now, updatedAt: now };
    await references.assertReferences({ campusId });
    return documentOperation(() => repository.insertMap(document));
  }

  async function updateMap(id: ObjectId, campusId: string, input: CampusMapChanges): Promise<CampusMapDocument> {
    documentObjectId(id);
    const campus = referenceUuid(campusId, 'campusId');
    const stored = await documentOperation(() => repository.findMapById(id, campus));
    if (!stored || stored.campusId !== campus) throw new ApiError(404, 'NOT_FOUND', 'Campus map not found.');
    // Whitelist mutable fields. IDs, campus, version and creation date cannot be reassigned.
    const changes: CampusMapChanges & { updatedAt: Date } = { updatedAt: new Date() };
    for (const key of ['status', 'buildings', 'model', 'activatedAt', 'archivedAt'] as const) {
      if (input[key] !== undefined) Object.assign(changes, { [key]: input[key] });
    }
    if (changes.status !== undefined) validateStatus(changes.status);
    await references.assertReferences({ campusId: stored.campusId });
    const updated = await documentOperation(() => repository.updateMap(id, campus, changes));
    if (!updated) throw new ApiError(404, 'NOT_FOUND', 'Campus map not found.');
    return updated;
  }

  return { getActiveMap, createMap, updateMap };
}

function validateStatus(status: unknown): void {
  if (!['DRAFT', 'ACTIVE', 'ARCHIVED'].includes(status as string)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid map status.');
  }
}

export const { getActiveMap, createMap, updateMap } = createMapService();
