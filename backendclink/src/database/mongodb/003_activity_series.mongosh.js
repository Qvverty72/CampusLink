// Additive migration for the actual CampusLink schema. Never run legacy bootstrap001.
if (!db.getCollectionNames().includes('activities') || !db.getCollectionNames().includes('activity_participation')) {
  throw new Error('activities and activity_participation must exist first.');
}
// Series definition is embedded in activities; never create another collection.
// Individual activities have no seriesId and remain outside this partial unique index.
// Duplicates must be reviewed, never deleted automatically by a migration.
db.activities.createIndex({ seriesId: 1, occurrenceIndex: 1 }, {
  name: 'series_occurrence_uq', unique: true, partialFilterExpression: { seriesId: { $type: 'objectId' } },
});
