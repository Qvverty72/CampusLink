import { Db, MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME ?? 'campuslink';

if (!uri) {
    throw new Error('MONGODB_URI is required');
}

const client = new MongoClient(uri);
let dbPromise: Promise<Db> | null = null;

export function getMongoDb(): Promise<Db> {
    if (!dbPromise) {
        dbPromise = client.connect().then(() => client.db(dbName));
    }
    return dbPromise;
}

export async function closeMongo(): Promise<void> {
    await client.close();
    dbPromise = null;
}