// CampusLink MongoDB v1 — ejecutar con mongosh.
const targetDbName = process.env.MONGODB_DB_NAME || 'campuslink';
db = db.getSiblingDB(targetDbName);

const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
const vector3 = {
    bsonType: 'array', minItems: 3, maxItems: 3,
    items: { bsonType: ['double', 'int', 'long', 'decimal'] }
};

function recreateValidator(name, validator) {
    const exists = db.getCollectionInfos({ name }).length > 0;
    if (!exists) db.createCollection(name, { validator, validationLevel: 'strict', validationAction: 'error' });
    else db.runCommand({ collMod: name, validator, validationLevel: 'strict', validationAction: 'error' });
}

recreateValidator('campus_maps', {
    $jsonSchema: {
        bsonType: 'object',
        required: ['campusId', 'version', 'schemaVersion', 'status', 'model', 'buildings', 'createdAt', 'updatedAt'],
        properties: {
            campusId: { bsonType: 'string', pattern: uuidPattern },
            version: { bsonType: 'int', minimum: 1 },
            schemaVersion: { bsonType: 'int', minimum: 1 },
            status: { enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'] },
            model: {
                bsonType: 'object', required: ['key', 'assetPath', 'dataSource', 'sourceHash'],
                properties: {
                    key: { bsonType: 'string' },
                    assetPath: { bsonType: 'string' },
                    dataSource: { bsonType: 'string' },
                    sourceHash: { bsonType: 'string' }
                }
            },
            buildings: {
                bsonType: 'array',
                items: {
                    bsonType: 'object', required: ['id', 'name', 'focusTarget', 'focusPosition', 'floors'],
                    properties: {
                        id: { bsonType: 'string' }, name: { bsonType: 'string' },
                        focusTarget: vector3, focusPosition: vector3,
                        floors: {
                            bsonType: 'array',
                            items: {
                                bsonType: 'object',
                                required: ['id', 'level', 'meshName', 'name', 'description', 'transform', 'subMeshes', 'pois'],
                                properties: {
                                    id: { bsonType: 'string' },
                                    level: { bsonType: 'int', minimum: 1 },
                                    meshName: { bsonType: 'string' },
                                    name: { bsonType: 'string' },
                                    description: { bsonType: 'string' },
                                    transform: {
                                        bsonType: 'object', required: ['position', 'rotation', 'scale'],
                                        properties: { position: vector3, rotation: vector3, scale: vector3 }
                                    },
                                    subMeshes: { bsonType: 'array', items: { bsonType: 'string' } },
                                    pois: {
                                        bsonType: 'array',
                                        items: {
                                            bsonType: 'object',
                                            required: ['id', 'code', 'name', 'type', 'positionLocal', 'active', 'createdAt', 'updatedAt'],
                                            properties: {
                                                id: { bsonType: 'string' }, code: { bsonType: 'string' },
                                                name: { bsonType: 'string' },
                                                type: { enum: ['AUDITORIUM', 'CAFETERIA', 'LIBRARY', 'CHAPEL', 'LAB', 'OFFICE', 'SPORTS', 'SERVICE', 'OTHER'] },
                                                description: { bsonType: ['string', 'null'] },
                                                positionLocal: vector3,
                                                iconKey: { bsonType: ['string', 'null'] },
                                                active: { bsonType: 'bool' },
                                                createdAt: { bsonType: 'date' }, updatedAt: { bsonType: 'date' }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            createdAt: { bsonType: 'date' }, updatedAt: { bsonType: 'date' },
            activatedAt: { bsonType: ['date', 'null'] }, archivedAt: { bsonType: ['date', 'null'] }
        }
    }
});

recreateValidator('activities', {
    $jsonSchema: {
        bsonType: 'object',
        required: ['campusId', 'creatorUserId', 'mapId', 'type', 'title', 'description', 'startsAt', 'endsAt', 'location', 'status', 'createdAt', 'updatedAt'],
        properties: {
            campusId: { bsonType: 'string', pattern: uuidPattern },
            creatorUserId: { bsonType: 'string', pattern: uuidPattern },
            mapId: { bsonType: 'objectId' },
            type: { enum: ['COMMUNITY_ACTIVITY', 'OFFICIAL_EVENT', 'STUDY_GROUP', 'WORKSHOP', 'SPORT'] },
            title: { bsonType: 'string' }, description: { bsonType: 'string' },
            startsAt: { bsonType: 'date' }, endsAt: { bsonType: 'date' },
            location: {
                bsonType: 'object', required: ['buildingId', 'floorId'],
                properties: {
                    buildingId: { bsonType: 'string' }, floorId: { bsonType: 'string' },
                    poiId: { bsonType: ['string', 'null'] }, positionLocal: { anyOf: [vector3, { bsonType: 'null' }] }
                }
            },
            recurrence: {
                bsonType: ['object', 'null'],
                properties: {
                    frequency: { enum: ['DAILY', 'WEEKLY', 'MONTHLY'] },
                    interval: { bsonType: 'int', minimum: 1 },
                    daysOfWeek: { bsonType: 'array', items: { bsonType: 'int', minimum: 0, maximum: 6 } },
                    until: { bsonType: ['date', 'null'] }, count: { bsonType: ['int', 'null'], minimum: 1 }
                }
            },
            bannerStoragePath: { bsonType: ['string', 'null'] }, category: { bsonType: ['string', 'null'] },
            tags: { bsonType: 'array', items: { bsonType: 'string' } },
            status: { enum: ['ACTIVE', 'CANCELLED', 'FINISHED', 'HIDDEN'] },
            hiddenReason: { bsonType: ['string', 'null'] },
            createdAt: { bsonType: 'date' }, updatedAt: { bsonType: 'date' }, deletedAt: { bsonType: ['date', 'null'] }
        }
    }
});

recreateValidator('activity_participations', {
    $jsonSchema: {
        bsonType: 'object',
        required: ['activityId', 'campusId', 'userId', 'role', 'status', 'joinedAt', 'updatedAt'],
        properties: {
            activityId: { bsonType: 'objectId' },
            campusId: { bsonType: 'string', pattern: uuidPattern },
            userId: { bsonType: 'string', pattern: uuidPattern },
            role: { enum: ['CREATOR', 'PARTICIPANT'] },
            status: { enum: ['REGISTERED', 'CANCELLED'] },
            joinedAt: { bsonType: 'date' }, cancelledAt: { bsonType: ['date', 'null'] }, updatedAt: { bsonType: 'date' }
        }
    }
});

// Indexes
// Un campus no puede tener dos documentos con la misma versión.
db.campus_maps.createIndex({ campusId: 1, version: 1 }, { unique: true, name: 'campus_version_uq' });
// Solo un mapa ACTIVE por campus.
db.campus_maps.createIndex(
    { campusId: 1, status: 1 },
    { unique: true, partialFilterExpression: { status: 'ACTIVE' }, name: 'one_active_map_per_campus' }
);

db.activities.createIndex({ campusId: 1, status: 1, startsAt: 1 }, { name: 'activity_campus_status_start_idx' });
db.activities.createIndex({ creatorUserId: 1, createdAt: -1 }, { name: 'activity_creator_idx' });
db.activities.createIndex({ mapId: 1 }, { name: 'activity_map_idx' });
db.activities.createIndex({ 'location.floorId': 1 }, { name: 'activity_floor_idx' });
db.activities.createIndex({ 'location.poiId': 1 }, { sparse: true, name: 'activity_poi_idx' });

db.activity_participations.createIndex({ activityId: 1, userId: 1 }, { unique: true, name: 'activity_user_uq' });
db.activity_participations.createIndex({ userId: 1, status: 1 }, { name: 'participation_user_status_idx' });
db.activity_participations.createIndex({ campusId: 1, status: 1 }, { name: 'participation_campus_status_idx' });

print('CampusLink MongoDB collections, validators and indexes ready.');

print('Collections:');
printjson(db.getCollectionNames().sort());

print('\nActive maps:');
printjson(db.campus_maps.find({ status: 'ACTIVE' }, { campusId: 1, version: 1, status: 1, 'model.key': 1 }).toArray());

print('\nIndexes campus_maps:');
printjson(db.campus_maps.getIndexes());
print('\nIndexes activities:');
printjson(db.activities.getIndexes());
print('\nIndexes activity_participations:');
printjson(db.activity_participations.getIndexes());