import { env } from '../config/env.js';

// Driver connection setup (notably SRV DNS) is not always covered by operation timeouts.
export async function withDeadline<T>(operation: Promise<T>, timeoutMs = env.databaseTimeoutMs): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const error = new Error('Dependency operation timed out');
          error.name = 'DependencyTimeoutError';
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}
