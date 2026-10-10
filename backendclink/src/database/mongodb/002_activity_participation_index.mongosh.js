// Apply only to the current singular collection; never run the legacy bootstrap.
// Existing duplicate records must be reviewed explicitly, not deleted by a migration.
if (!db.getCollectionNames().includes('activity_participation')) {
  throw new Error('activity_participation must exist before applying this index.');
}
db.activity_participation.createIndex(
  { activityId: 1, userId: 1 }, { unique: true, name: 'activity_user_uq' }
);
