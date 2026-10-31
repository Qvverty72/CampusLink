import { env } from '../../config/env.js';

// La carrera temporal no cancela la operación subyacente; cubre inicializaciones del driver,
// como la resolución DNS SRV, que pueden quedar fuera de los límites propios del driver.
/** Rechaza al superar el plazo configurado; la operación original puede seguir ejecutándose. */
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
