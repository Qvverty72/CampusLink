import 'dotenv/config';

import { app } from './app.js';
import { env } from './config/env.js';
import { closeMongoDB, connectMongoDB } from './database/mongodb/client.js';

async function startServer(): Promise<void> {
  await connectMongoDB();

  const server = app.listen(env.port, () => {
    console.log(`CampusLink API running on port ${env.port}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`${signal} received. Shutting down...`);
    server.close(async () => {
      await closeMongoDB();
      process.exit(0);
    });
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

startServer().catch((error: unknown) => {
  console.error('Unable to start CampusLink API', error);
  process.exit(1);
});

