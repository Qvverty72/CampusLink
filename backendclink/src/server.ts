import 'dotenv/config';

// Dynamic bootstrap makes configuration/driver failures pass through the safe logger too.
async function main(): Promise<void> {
  const { startApi, stopApi } = await import('./bootstrap.js');
  const { env } = await import('./config/env.js');
  const server = await startApi();
  const { startActivityNotificationWorker } = await import('./modules/activities/activities.notifications.worker.js');
  const stopNotifications = startActivityNotificationWorker();
  console.log('CampusLink API running on port ' + env.port);
  let stopping = false;
  const shutdown = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    try { await stopNotifications(); await stopApi(server); }
    catch { console.error('API shutdown failed'); process.exitCode = 1; }
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}
main().catch(() => {
  console.error('Unable to start CampusLink API. Check environment settings and required database access.');
  process.exit(1);
});
