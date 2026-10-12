import { pendingCreatorChanges, cancelCreatorCommunityActivities, acknowledgeCreatorChange,
  type CreatorChange } from './activities.lifecycle.repository.js';

export interface CreatorChangeDependencies {
  pending: () => Promise<CreatorChange[]>;
  cancel: (change: CreatorChange) => Promise<void>;
  acknowledge: (change: CreatorChange) => Promise<void>;
}
const defaults: CreatorChangeDependencies = { pending: pendingCreatorChanges,
  cancel: cancelCreatorCommunityActivities, acknowledge: acknowledgeCreatorChange };
export async function dispatchCreatorChanges(dependencies = defaults, stopped = () => false) {
  const changes = await dependencies.pending();
  let processed = 0, failed = 0;
  for (const change of changes) {
    if (stopped()) break;
    try { await dependencies.cancel(change); await dependencies.acknowledge(change); processed++; }
    catch { failed++; }
  }
  return { processed, failed };
}
export function startActivityLifecycleWorker(): () => Promise<void> {
  let stopped = false, timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void>;
  const run = async () => {
    try {
      const result = await dispatchCreatorChanges(defaults, () => stopped);
      if (result.failed) console.error('Activity cancellations pending; dependencies unavailable');
    } catch { console.error('Activity creator change queue unavailable'); }
    if (!stopped) { timer = setTimeout(() => { running = run(); }, 15000); timer.unref(); }
  };
  running = run();
  return async () => { stopped = true; if (timer) clearTimeout(timer); await running; };
}
