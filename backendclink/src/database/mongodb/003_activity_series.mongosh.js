// Migración aditiva para el esquema actual de CampusLink; no ejecutar el bootstrap legado 001.
if (!db.getCollectionNames().includes('activities') || !db.getCollectionNames().includes('activity_participation')) {
  throw new Error('activities and activity_participation must exist first.');
}
// La definición de serie se almacena en `activities`; no se crea otra colección.
// Las actividades individuales no tienen `seriesId` y quedan fuera del índice parcial.
// Revisar duplicados manualmente; la migración no los elimina.
db.activities.createIndex({ seriesId: 1, occurrenceIndex: 1 }, {
  name: 'series_occurrence_uq', unique: true, partialFilterExpression: { seriesId: { $type: 'objectId' } },
});
