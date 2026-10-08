import { setServers } from 'node:dns/promises';
import { Db, MongoClient } from 'mongodb';
import { env } from '../../config/env.js';
import { withDeadline } from '../../services/deadline.js';

// Optional resolver override for this Node process; does not change Windows/network settings.
// Useful when the network's DNS refuses Atlas SRV/TXT lookups.
if (env.mongodbDnsServers.length) setServers(env.mongodbDnsServers);

// One pool shared by repositories. Bound server selection, connection and operations.
export const mongoClient = new MongoClient(env.mongodbUri, {
  serverSelectionTimeoutMS: env.databaseTimeoutMs,
  connectTimeoutMS: env.databaseTimeoutMs,
  timeoutMS: env.databaseTimeoutMs,
});
export async function connectMongoDB(): Promise<Db> {
  const attempt = mongoClient.connect();
  try { await withDeadline(attempt); }
  catch (error: unknown) {
    console.error('MongoDB connection failed', {
      errorType: error instanceof Error && /^[A-Za-z0-9_]{1,60}$/.test(error.name) ? error.name : 'ConnectionError',
      phase: typeof error === 'object' && error !== null && 'syscall' in error && typeof error.syscall === 'string' && /^(querySrv|queryTxt|connect|getaddrinfo)$/.test(error.syscall) ? error.syscall : undefined,
      code: typeof error === 'object' && error !== null && 'code' in error && (typeof error.code === 'number' || (typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{0,30}$/.test(error.code))) ? error.code : undefined,
    });
    // If uncancellable SRV resolution completes late, do not leave a newly opened pool behind.
    void attempt.then(() => mongoClient.close()).catch(() => {});
    throw new Error('MongoDB connection timed out or failed');
  }
  const db = getMongoDB();
  await db.command({ ping: 1 }, { timeoutMS: env.databaseTimeoutMs });
  return db;
}
export function getMongoDB(): Db { return mongoClient.db(env.mongodbDbName); }
export async function closeMongoDB(): Promise<void> { await withDeadline(mongoClient.close()); }
