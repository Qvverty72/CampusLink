/** Genera una clave de idempotencia; la autorización siempre procede de la cuenta autenticada. */
export function activityOperationId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, value => {
    const random = Math.floor(Math.random() * 16);
    return (value === 'x' ? random : (random & 3) | 8).toString(16);
  });
}
