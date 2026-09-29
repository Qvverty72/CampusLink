// Debe cargarse antes de evaluar `env.ts`; así la configuración local queda
// disponible para todos los imports que participan en el bootstrap.
import 'dotenv/config';

import { app } from './app.js';
import { env } from './config/env.js';
import { closeMongoDB, connectMongoDB } from './database/mongodb/client.js';

/**
 * Punto de entrada del proceso backend.
 *
 * La API comienza a escuchar solo después de comprobar MongoDB. Este arranque
 * fail-fast evita aceptar requests cuando el repository todavía no puede leer Atlas.
 */
async function startServer(): Promise<void> {
  await connectMongoDB();

  const server = app.listen(env.port, () => {
    console.log(`CampusLink API running on port ${env.port}`);
  });

  // SIGINT y SIGTERM permiten cerrar primero el servidor HTTP y luego el pool de
  // MongoDB, en lugar de cortar conexiones activas al detener Docker o el proceso local.
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
  // Un fallo de configuración o conexión durante el bootstrap es fatal: todavía
  // no existe un servidor HTTP capaz de responder de manera segura.
  console.error('Unable to start CampusLink API', error);
  process.exit(1);
});

