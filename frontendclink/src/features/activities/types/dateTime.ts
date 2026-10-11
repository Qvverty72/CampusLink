export interface ActivityDateTimeFieldProps {
  label: string;
  mode: 'date' | 'time';
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Keep the existing draft format and device timezone; never parse a date as UTC. */
export function formatPickerValue(value: Date, mode: 'date' | 'time'): string {
  return mode === 'date'
    ? `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()}`
    : `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export function pickerDate(value: string, mode: 'date' | 'time'): Date {
  if (mode === 'date') {
    const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    if (parts) {
      const [, day, month, year] = parts.map(Number);
      const date = new Date(year, month - 1, day, 12);
      if (year >= 1000 && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) return date;
    }
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return today;
  }
  const parts = /^(\d{2}):(\d{2})$/.exec(value);
  const now = new Date();
  // A separate time selector has no activity day yet. Validate actual DST gaps on submission.
  const hour = parts && Number(parts[1]) < 24 ? Number(parts[1]) : now.getHours();
  const minute = parts && Number(parts[2]) < 60 ? Number(parts[2]) : now.getMinutes();
  return new Date(2000, 0, 15, hour, minute);
}

export function browserDateValue(value: string): string {
  const date = pickerDate(value, 'date');
  return formatPickerValue(date, 'date') === value
    ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : '';
}

export function browserDateSelection(value: string): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!parts) return '';
  const formatted = `${parts[3]}/${parts[2]}/${parts[1]}`;
  return browserDateValue(formatted) === value ? formatted : '';
}
