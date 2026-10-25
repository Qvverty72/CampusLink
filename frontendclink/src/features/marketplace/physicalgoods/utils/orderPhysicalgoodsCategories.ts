/** Mantiene el orden del catálogo y los IDs; Otros siempre queda al final. */
export function orderPhysicalgoodsCategories<T extends { name: string }>(options: readonly T[]): T[] {
  const other = (option: T) => option.name.trim().toLocaleLowerCase('es-CL') === 'otros';
  return [...options.filter(option => !other(option)), ...options.filter(other)];
}
