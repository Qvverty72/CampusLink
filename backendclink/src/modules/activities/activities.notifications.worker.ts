import { enqueueStartedOfficialOccurrences, findPendingActivityNotifications, findNotificationParticipants, markNotificationDelivered,
  type PendingActivityNotification } from './activities.notifications.repository.js';
import { deliverActivityNotification } from '../users/notifications.repository.js';

export interface NotificationDeliveryDependencies {
  enqueueStarted?: () => Promise<void>;
  pending: () => Promise<PendingActivityNotification[]>;
  participants: (task: PendingActivityNotification) => Promise<string[]>;
  deliver: (task: PendingActivityNotification, participants: string[] | null) => Promise<void>;
  acknowledge: (task: PendingActivityNotification) => Promise<void>;
}
const defaults: NotificationDeliveryDependencies = { pending: findPendingActivityNotifications,
  enqueueStarted: enqueueStartedOfficialOccurrences,
  participants: findNotificationParticipants, deliver: deliverActivityNotification, acknowledge: markNotificationDelivered };

export async function dispatchActivityNotifications(dependencies = defaults, stopped = () => false): Promise<{ delivered: number; failed: number }> {
  if (stopped()) return { delivered: 0, failed: 0 };
  await dependencies.enqueueStarted?.();
  const tasks = await dependencies.pending();
  let delivered = 0, failed = 0;
  for (const task of tasks) {
    if (stopped()) break;
    try {
      const recipients = task.event.type === 'ACTIVITY_CHANGED' ? await dependencies.participants(task) : null;
      await dependencies.deliver(task, recipients);
      await dependencies.acknowledge(task);
      delivered++;
    } catch { failed++; }
  }
  return { delivered, failed };
}

/** Durable events survive process restarts; SQL failures never invalidate a published activity. */
export function startActivityNotificationWorker(): () => Promise<void> {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void>;
  const run = async () => {
    try {
      const result = await dispatchActivityNotifications(defaults, () => stopped);
      if (result.failed) console.error('Activity notification delivery unavailable; pending events retained');
    } catch { console.error('Activity notification queue unavailable'); }
    if (!stopped) { timer = setTimeout(() => { running = run(); }, 60_000); timer.unref(); }
  };
  running = run();
  return async () => { stopped = true; if (timer) clearTimeout(timer); await running; };
}
