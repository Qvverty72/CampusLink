export type ActivityDraft = { title: string; description: string; date: string; time: string; location: string };
export const emptyActivity: ActivityDraft = { title: '', description: '', date: '', time: '', location: '' };

export function validateActivityStep(draft: ActivityDraft, step: number): string | null {
  if (step === 0 && draft.title.trim().length < 3) return 'Escribe un nombre de al menos 3 caracteres.';
  if (step === 1) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return 'Usa una fecha con formato AAAA-MM-DD.';
    const date = new Date(`${draft.date}T12:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== draft.date) return 'Escribe una fecha válida.';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) return 'Usa una hora válida en formato HH:MM.';
  }
  if (step === 2 && !draft.location.trim()) return 'Elige una ubicación de ejemplo.';
  return null;
}
