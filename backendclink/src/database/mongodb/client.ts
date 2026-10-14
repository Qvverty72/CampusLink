import { setServers } from 'node:dns/promises';
import { Db, MongoClient } from 'mongodb';
import { env } from '../../config/env.js';
import { withDeadline } from '../../services/deadline.js';

// Reemplazo opcional del resolver de este proceso; no cambia la configuración de Windows o la red.
// Sirve cuando el DNS de la red no resuelve las consultas SRV/TXT de Atlas.
if (env.mongodbDnsServers.length) setServers(env.mongodbDnsServers);

// Un pool compartido por los repositorios, con límites para selección, conexión y operaciones.
export const mongoClient = new MongoClient(env.mongodbUri, {
  serverSelectionTimeoutMS: env.databaseTimeoutMs,
  connectTimeoutMS: env.databaseTimeoutMs,
  timeoutMS: env.databaseTimeoutMs,
});
/** Abre el cliente compartido y espera una respuesta de ping antes de declarar MongoDB disponible. */
export async function connectMongoDB(): Promise<Db> {
  const attempt = mongoClient.connect();
  try { await withDeadline(attempt); }
  catch (error: unknown) {
    console.error('MongoDB connection failed', {
      errorType: error instanceof Error && /^[A-Za-z0-9_]{1,60}$/.test(error.name) ? error.name : 'ConnectionError',
      phase: typeof error === 'object' && error !== null && 'syscall' in error && typeof error.syscall === 'string' && /^(querySrv|queryTxt|connect|getaddrinfo)$/.test(error.syscall) ? error.syscall : undefined,
      code: typeof error === 'object' && error !== null && 'code' in error && (typeof error.code === 'number' || (typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{0,30}$/.test(error.code))) ? error.code : undefined,
    });
    // Si una consulta SRV no cancelable termina tarde, cierra el pool que pudiera abrirse después.
    void attempt.then(() => mongoClient.close()).catch(() => {});
    throw new Error('MongoDB connection timed out or failed');
  }
  const db = getMongoDB();
  await db.command({ ping: 1 }, { timeoutMS: env.databaseTimeoutMs });
  return db;
}
/** Devuelve la base configurada a los repositorios que comparten este cliente. */
export function getMongoDB(): Db { return mongoClient.db(env.mongodbDbName); }
/** Cierra el cliente compartido respetando el límite de tiempo de dependencias. */
export async function closeMongoDB(): Promise<void> { await withDeadline(mongoClient.close()); }
