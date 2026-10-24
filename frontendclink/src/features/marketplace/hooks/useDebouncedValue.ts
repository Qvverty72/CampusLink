import { useEffect, useState } from 'react';

/** Espera al final de la escritura y cancela el temporizador al cambiar o desmontar. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(() => value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
