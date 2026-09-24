/** Local-calendar date helpers. Never use toISOString().slice(0,10) for "today". */

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toYMD(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function addDays(ymd: string, days: number): string {
  const d = parseLocalDate(ymd);
  d.setDate(d.getDate() + days);
  return toYMD(d);
}

/** Monday = start of week. Returns { start, end } as YYYY-MM-DD (Mon–Sun). */
export function weekRangeMonSun(ymd: string): { start: string; end: string } {
  const d = parseLocalDate(ymd);
  const day = d.getDay(); // 0=Sun … 6=Sat
  const offsetToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + offsetToMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { start: toYMD(mon), end: toYMD(sun) };
}

export function monthBounds(ymd: string): { start: string; end: string } {
  const d = parseLocalDate(ymd);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: toYMD(start), end: toYMD(end) };
}

export function yearBounds(ymd: string): { start: string; end: string } {
  const d = parseLocalDate(ymd);
  return {
    start: `${d.getFullYear()}-01-01`,
    end: `${d.getFullYear()}-12-31`,
  };
}

export function daysInMonth(ymd: string): number {
  const d = parseLocalDate(ymd);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function formatMoney(n: number): string {
  const neg = n < 0;
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('en-CA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return neg ? `-$${formatted}` : `$${formatted}`;
}

export function formatShortDate(ymd: string): string {
  const d = parseLocalDate(ymd);
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

export function formatWeekLabel(start: string, end: string): string {
  const a = parseLocalDate(start);
  const b = parseLocalDate(end);
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric' };
  return `(${a.toLocaleDateString('en-CA', opts)}–${b.toLocaleDateString('en-CA', opts)})`;
}

export function formatMonthYear(ymd: string): string {
  const d = parseLocalDate(ymd);
  return d.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
}

export function getYear(ymd: string): number {
  return parseLocalDate(ymd).getFullYear();
}

export function getMonth(ymd: string): number {
  return parseLocalDate(ymd).getMonth(); // 0–11
}

export function shiftMonth(ymd: string, delta: number): string {
  const d = parseLocalDate(ymd);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + delta);
  const max = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, max));
  return toYMD(d);
}

export function shiftYear(ymd: string, delta: number): string {
  const d = parseLocalDate(ymd);
  d.setFullYear(d.getFullYear() + delta);
  return toYMD(d);
}

export function shiftWeek(ymd: string, delta: number): string {
  return addDays(ymd, delta * 7);
}

export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function weekdayMon0(ymd: string): number {
  const d = parseLocalDate(ymd).getDay();
  return d === 0 ? 6 : d - 1; // Mon=0 … Sun=6
}

export function monthCalendarGrid(ymd: string): (string | null)[][] {
  const { start, end } = monthBounds(ymd);
  const firstDow = weekdayMon0(start); // 0=Mon
  const days = eachDay(start, end);
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  cells.push(...days);
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

export function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function inRange(ymd: string, start: string, end: string): boolean {
  return ymd >= start && ymd <= end;
}
