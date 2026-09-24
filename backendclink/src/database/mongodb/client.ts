import { Db, MongoClient } from 'mongodb';

import { env } from '../../config/env.js';

const client = new MongoClient(env.mongodbUri);

export async function connectMongoDB(): Promise<Db> {
  await client.connect();
  await client.db(env.mongodbDbName).command({ ping: 1 });

  console.log(`MongoDB connected to database "${env.mongodbDbName}"`);
  return client.db(env.mongodbDbName);
}

export function getMongoDB(): Db {
  return client.db(env.mongodbDbName);
}

export async function closeMongoDB(): Promise<void> {
  await client.close();
}