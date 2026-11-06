/** 83 500 ms → "1:23" */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Med tiondelar, t.ex. "1:23.4" – används i resultat. */
export function formatDurationPrecise(ms: number): string {
  const tenths = Math.floor((Math.max(0, ms) % 1000) / 100);
  return `${formatDuration(ms)}.${tenths}`;
}

const dateFmt = new Intl.DateTimeFormat('sv-SE', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(iso: string): string {
  const s = dateFmt.format(new Date(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
