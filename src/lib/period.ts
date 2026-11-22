// Helper periode waktu untuk filter statistik keuangan (Dashboard & Keuangan).

export type Period = 'today' | 'week' | 'month' | 'year' | 'all';

export const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Hari ini' },
  { value: 'week', label: '7 hari terakhir' },
  { value: 'month', label: 'Bulan ini' },
  { value: 'year', label: 'Tahun ini' },
  { value: 'all', label: 'Semua waktu' },
];

/** Teks pembanding untuk periode sebelumnya. */
export const PREVIOUS_LABEL: Record<Period, string> = {
  today: 'kemarin',
  week: '7 hari sebelumnya',
  month: 'bulan lalu',
  year: 'tahun lalu',
  all: '',
};

export interface Range { start: Date; end: Date } // end eksklusif

/** Parse "yyyy-mm-dd" sebagai tanggal lokal (new Date("yyyy-mm-dd") memakai UTC). */
export function parseDate(value: unknown): Date | null {
  const m = String(value ?? '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? null : d;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function periodRange(period: Period, ref = new Date()): Range | null {
  const today = startOfDay(ref);
  switch (period) {
    case 'today': return { start: today, end: addDays(today, 1) };
    case 'week': return { start: addDays(today, -6), end: addDays(today, 1) };
    case 'month': return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: new Date(today.getFullYear(), today.getMonth() + 1, 1) };
    case 'year': return { start: new Date(today.getFullYear(), 0, 1), end: new Date(today.getFullYear() + 1, 0, 1) };
    default: return null;
  }
}

export function previousRange(period: Period, ref = new Date()): Range | null {
  const today = startOfDay(ref);
  switch (period) {
    case 'today': return { start: addDays(today, -1), end: today };
    case 'week': return { start: addDays(today, -13), end: addDays(today, -6) };
    case 'month': return { start: new Date(today.getFullYear(), today.getMonth() - 1, 1), end: new Date(today.getFullYear(), today.getMonth(), 1) };
    case 'year': return { start: new Date(today.getFullYear() - 1, 0, 1), end: new Date(today.getFullYear(), 0, 1) };
    default: return null;
  }
}

export function inRange(value: unknown, range: Range | null) {
  if (!range) return true;
  const d = parseDate(value);
  return !!d && d >= range.start && d < range.end;
}

export const formatRp = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

/** Format ringkas untuk sumbu grafik: 1,5 jt / 750 rb. */
export function formatCompact(n: number) {
  const abs = Math.abs(n);
  const fmt = (v: number) => v.toLocaleString('id-ID', { maximumFractionDigits: 1 });
  if (abs >= 1_000_000_000) return `${fmt(n / 1_000_000_000)} M`;
  if (abs >= 1_000_000) return `${fmt(n / 1_000_000)} jt`;
  if (abs >= 1_000) return `${fmt(n / 1_000)} rb`;
  return fmt(n);
}

/**
 * Persentase perubahan dibanding periode sebelumnya.
 * null = tidak bisa dibandingkan (periode sebelumnya 0).
 */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}
