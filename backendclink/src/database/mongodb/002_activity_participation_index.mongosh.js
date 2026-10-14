// Aplicar solo a la colección singular vigente; no ejecutar el bootstrap legado.
// Revisar duplicados existentes de forma explícita; la migración no los elimina.
if (!db.getCollectionNames().includes('activity_participation')) {
  throw new Error('activity_participation must exist before applying this index.');
}
db.activity_participation.createIndex(
  { activityId: 1, userId: 1 }, { unique: true, name: 'activity_user_uq' }
);
