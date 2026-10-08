import { env } from '../../config/env.js';
import { connectMongoDB, getMongoDB } from './client.js';

export type MongoProbeCollection = 'campus_maps' | 'activities' | 'activity_participation';
export async function probeMongoCollections(names: readonly MongoProbeCollection[]): Promise<void> {
  await connectMongoDB();
  const db = getMongoDB();
  const options = { timeoutMS: env.databaseTimeoutMs, signal: AbortSignal.timeout(env.databaseTimeoutMs) };
  await db.command({ ping: 1 }, options);
  // Atlas rejects the $in name filter on some deployments. Exact name filters also
  // distinguish missing collections from empty collections without scanning the catalog.
  await Promise.all(names.map(async name => {
    const existing = await db.listCollections({ name }, { ...options, nameOnly: true }).toArray();
    if (!existing.length) {
      console.error('Required MongoDB collection is missing', { collection: name });
      throw new Error('Required MongoDB collection is missing');
    }
    await db.collection(name).findOne({}, { ...options, projection: { _id: 1 } });
  }));
}
