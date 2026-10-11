export const ACTIVITY_CONTENT_LIMITS = { title: 120, description: 2000, customLabel: 160 } as const;

/** Fixed descriptions approved for new community activities and official events. */
export const ACTIVITY_DESCRIPTION_OPTIONS: readonly string[] = [
  'Grupo de estudio', 'Actividad de deporte', 'Taller', 'Charla o conferencia',
  'Actividad cultural', 'Encuentro comunitario', 'Jornada informativa',
];

export interface CreateActivityInput {
  title: string; description: string; startAt: string; endAt: string;
  location: { buildingKey: string; floorKey: string; poiKey?: string; customLabel?: string };
}

/** Domain catalog supplied by the map adapter; no meshes or rendering state. */
export interface ActivityLocationOption {
  id: string; name: string;
  floors: { id: string; name: string; pois: { id: string; name: string }[] }[];
}

export interface ActivityDraft {
  title: string; description: string; startDate: string; startTime: string; endDate: string; endTime: string;
  buildingKey: string; floorKey: string; poiKey: string; customLabel: string;
}

/** Interpret the explicitly labelled local date/time and reject rollover or a DST gap. */
export function localActivityTimestamp(dateText: string, timeText: string): string | null {
  const date = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateText.trim());
  const time = /^(\d{2}):(\d{2})$/.exec(timeText.trim());
  if (!date || !time) return null;
  const [, day, month, year] = date.map(Number); const [, hour, minute] = time.map(Number);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const result = new Date(year, month - 1, day, hour, minute);
  if (result.getFullYear() !== year || result.getMonth() !== month - 1 || result.getDate() !== day
    || result.getHours() !== hour || result.getMinutes() !== minute) return null;
  return result.toISOString();
}

export function validateActivityDraft(draft: ActivityDraft, locations: ActivityLocationOption[], now = Date.now(),
  options: { allowEnded?: boolean; timestamps?: { startAt: string | null; endAt: string | null } } = {}):
  { input: CreateActivityInput; error?: never } | { error: string; input?: never } {
  for (const field of ['title', 'description'] as const) {
    const controls = field === 'description' ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/ : /[\u0000-\u001F\u007F]/;
    if (!draft[field].trim() || draft[field].length > ACTIVITY_CONTENT_LIMITS[field] || controls.test(draft[field])) {
      return { error: `Completa ${field === 'title' ? 'el nombre' : 'la descripción'} (máximo ${ACTIVITY_CONTENT_LIMITS[field]} caracteres).` };
    }
  }
  if (draft.customLabel.length > ACTIVITY_CONTENT_LIMITS.customLabel || /[\u0000-\u001F\u007F]/.test(draft.customLabel)) {
    return { error: 'La referencia del lugar admite hasta 160 caracteres en una línea.' };
  }
  const startAt = options.timestamps ? options.timestamps.startAt : localActivityTimestamp(draft.startDate, draft.startTime);
  const endAt = options.timestamps ? options.timestamps.endAt : localActivityTimestamp(draft.endDate, draft.endTime);
  if (!startAt || !endAt) return { error: 'Usa fechas válidas DD/MM/AAAA y horas HH:mm (24 horas).' };
  if (Date.parse(endAt) <= Date.parse(startAt)) return { error: 'El término debe ser posterior al inicio.' };
  if (!options.allowEnded && Date.parse(endAt) <= now) return { error: 'La actividad todavía no debe haber terminado.' };
  const building = locations.find(value => value.id === draft.buildingKey);
  const floor = building?.floors.find(value => value.id === draft.floorKey);
  if (!floor || (draft.poiKey && !floor.pois.some(value => value.id === draft.poiKey))) {
    return { error: 'Selecciona un edificio, un piso y un punto de interés vigente si corresponde.' };
  }
  return { input: { title: draft.title.trim(), description: draft.description.trim(), startAt, endAt,
    location: { buildingKey: draft.buildingKey, floorKey: draft.floorKey,
      ...(draft.poiKey ? { poiKey: draft.poiKey } : {}), ...(draft.customLabel.trim() ? { customLabel: draft.customLabel.trim() } : {}) } } };
}
