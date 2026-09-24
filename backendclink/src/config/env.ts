const port = Number(process.env.PORT ?? 3000);
const mongodbUri = process.env.MONGODB_URI;
const mongodbDbName = process.env.MONGODB_DB_NAME;

if (!Number.isInteger(port) || port <= 0) {
  throw new Error('PORT must be a positive integer');
}

if (!mongodbUri) {
  throw new Error('MONGODB_URI is required');
}

if (!mongodbDbName) {
  throw new Error('MONGODB_DB_NAME is required');
}

export const env = {
  mongodbDbName,
  mongodbUri,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port,
};

