import { useCallback, useEffect, useState } from 'react';

// Solo memoria: conserva la espera al volver a un correo/pantalla en la misma ejecución.
// La protección de servidor/proveedor sigue siendo independiente de este control de UX.
const deadlines = new Map<string, number>();
const COOLDOWN_MS = 30_000;

/** Una fecha límite real evita extender o saltarse la espera por pausas de la aplicación. */
export function useResendCooldown(flow: 'registration' | 'recovery', email: string) {
  const key = `${flow}:${email.trim().toLowerCase()}`;
  const remaining = useCallback(() => Math.max(0, Math.ceil(((deadlines.get(key) ?? 0) - Date.now()) / 1000)), [key]);
  const [seconds, setSeconds] = useState(remaining);

  useEffect(() => {
    setSeconds(remaining());
    const timer = setInterval(() => setSeconds(remaining()), 250);
    return () => clearInterval(timer);
  }, [remaining]);

  function start() {
    const now = Date.now();
    for (const [entry, deadline] of deadlines) if (deadline <= now) deadlines.delete(entry);
    deadlines.set(key, now + COOLDOWN_MS);
    setSeconds(30);
  }

  return { seconds, remaining, start };
}
