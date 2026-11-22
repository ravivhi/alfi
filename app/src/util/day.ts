const pad = (n: number): string => (n < 10 ? '0' : '') + n;

export function dayKey(d: Date): string {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function utcOf(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((utcOf(b) - utcOf(a)) / 86400000);
}

export function addDays(day: string, n: number): string {
  const d = new Date(utcOf(day) + n * 86400000);
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
}
