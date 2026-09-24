// Centraliza la lectura y validación de variables para que el resto del backend
// consuma una configuración tipada y falle temprano ante valores indispensables.
const port = Number(process.env.PORT ?? 3000);
const mongodbUri = process.env.MONGODB_URI;
const mongodbDbName = process.env.MONGODB_DB_NAME ?? 'campuslink';

if (!Number.isInteger(port) || port <= 0) {
  throw new Error('PORT must be a positive integer');
}

if (!mongodbUri) {
  // La URI es obligatoria, pero nunca se imprime: contiene credenciales de Atlas.
  throw new Error('MONGODB_URI is required');
}

// Exportar un único objeto evita que cada módulo interprete defaults distintos.
export const env = {
  mongodbDbName,
  mongodbUri,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port,
};

