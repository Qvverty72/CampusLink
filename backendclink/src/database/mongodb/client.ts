import { Db, MongoClient } from 'mongodb';

import { env } from '../../config/env.js';

// MongoClient administra internamente un pool. Mantener una sola instancia a nivel
// de módulo evita crear una conexión nueva por cada request o repository.
const client = new MongoClient(env.mongodbUri);

/**
 * Abre la conexión compartida y verifica que Atlas responda antes de iniciar HTTP.
 * El ping valida conectividad y permisos sobre la base configurada sin modificar datos.
 */
export async function connectMongoDB(): Promise<Db> {
  await client.connect();
  await client.db(env.mongodbDbName).command({ ping: 1 });

  console.log(`MongoDB connected to database "${env.mongodbDbName}"`);
  return client.db(env.mongodbDbName);
}

/**
 * Entrega el handle de la base configurada sobre el MongoClient ya compartido.
 * Los repositories lo usan para seleccionar su colección, sin gestionar conexiones.
 */
export function getMongoDB(): Db {
  return client.db(env.mongodbDbName);
}

/** Libera el pool durante el apagado controlado del proceso. */
export async function closeMongoDB(): Promise<void> {
  await client.close();
}
