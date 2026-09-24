import type { Entry, ExpectedIncome } from './types';
import {
  daysInMonth,
  eachDay,
  getYear,
  inRange,
  isLeapYear,
  monthBounds,
  parseLocalDate,
  toYMD,
  weekRangeMonSun,
  yearBounds,
} from './date';

/** Convert dollars to integer cents (all sums are done in cents to avoid float drift). */
export function toCents(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Round a dollar value to whole cents (and normalise -0 to 0). */
export function roundCents(n: number): number {
  const c = toCents(n);
  return c === 0 ? 0 : c / 100;
}

/** Net for a set of entries: income − expenses + refunds (refunds reduce spend). */
export function netSaved(entries: Entry[]): number {
  let cents = 0;
  for (const e of entries) {
    if (e.type === 'income') cents += toCents(e.amount);
    else if (e.type === 'expense') cents -= toCents(e.amount);
    else if (e.type === 'refund') cents += toCents(e.amount);
  }
  return cents === 0 ? 0 : cents / 100;
}

export function sumByType(entries: Entry[], type: Entry['type']): number {
  let cents = 0;
  for (const e of entries) if (e.type === type) cents += toCents(e.amount);
  return cents === 0 ? 0 : cents / 100;
}

/** Spent = expenses − refunds (never negative per call site preference; clamp at 0 optional). */
export function spentAmount(entries: Entry[]): number {
  return Math.max(0, roundCents(sumByType(entries, 'expense') - sumByType(entries, 'refund')));
}

export function incomeAmount(entries: Entry[]): number {
  return sumByType(entries, 'income');
}

export function filterByDate(entries: Entry[], date: string): Entry[] {
  return entries.filter((e) => e.date === date);
}

export function filterByRange(entries: Entry[], start: string, end: string): Entry[] {
  return entries.filter((e) => inRange(e.date, start, end));
}

export function filterByTab(entries: Entry[], tabId: string): Entry[] {
  return entries.filter((e) => e.tabId === tabId);
}

export function filterByColumn(entries: Entry[], columnId: string): Entry[] {
  return entries.filter((e) => e.columnId === columnId);
}

export function columnTotalForDate(
  entries: Entry[],
  columnId: string,
  date: string,
): number {
  const list = entries.filter((e) => e.columnId === columnId && e.date === date);
  let t = 0;
  for (const e of list) {
    if (e.type === 'expense' || e.type === 'income') t += toCents(e.amount);
    else if (e.type === 'refund') t -= toCents(e.amount);
  }
  return t === 0 ? 0 : t / 100;
}

/** Days / weeks / months that contain ≥1 entry. */
export function uniqueDays(entries: Entry[]): string[] {
  return [...new Set(entries.map((e) => e.date))].sort();
}

export function uniqueWeeks(entries: Entry[]): string[] {
  const set = new Set<string>();
  for (const e of entries) {
    const { start } = weekRangeMonSun(e.date);
    set.add(start);
  }
  return [...set].sort();
}

export function uniqueMonths(entries: Entry[]): string[] {
  const set = new Set<string>();
  for (const e of entries) {
    const { start } = monthBounds(e.date);
    set.add(start);
  }
  return [...set].sort();
}

export function averages(entries: Entry[]): {
  allTime: number;
  avgMonthly: number;
  avgWeekly: number;
  avgDaily: number;
  monthsWithData: number;
  weeksWithData: number;
  daysWithData: number;
} {
  const allTime = netSaved(entries);
  const monthsWithData = uniqueMonths(entries).length;
  const weeksWithData = uniqueWeeks(entries).length;
  const daysWithData = uniqueDays(entries).length;
  return {
    allTime,
    avgMonthly: monthsWithData ? roundCents(allTime / monthsWithData) : 0,
    avgWeekly: weeksWithData ? roundCents(allTime / weeksWithData) : 0,
    avgDaily: daysWithData ? roundCents(allTime / daysWithData) : 0,
    monthsWithData,
    weeksWithData,
    daysWithData,
  };
}

export function expectedForMonth(
  expected: ExpectedIncome,
  ymdInMonth: string,
): number {
  const dim = daysInMonth(ymdInMonth);
  if (expected.frequency === 'daily') return roundCents(expected.amount * dim);
  if (expected.frequency === 'monthly') return roundCents(expected.amount);
  // yearly
  const year = getYear(ymdInMonth);
  const days = isLeapYear(year) ? 366 : 365;
  return roundCents((expected.amount / days) * dim);
}

export function impliedDaily(
  expected: ExpectedIncome,
  ymdInMonth: string,
): number {
  if (expected.frequency === 'daily') return expected.amount;
  if (expected.frequency === 'monthly') return expected.amount / daysInMonth(ymdInMonth);
  const year = getYear(ymdInMonth);
  return expected.amount / (isLeapYear(year) ? 366 : 365);
}

export function impliedWeekly(
  expected: ExpectedIncome,
  ymdInMonth: string,
): number {
  return impliedDaily(expected, ymdInMonth) * 7;
}

export function impliedMonthly(
  expected: ExpectedIncome,
  ymdInMonth: string,
): number {
  return expectedForMonth(expected, ymdInMonth);
}

/**
 * Payday marker dates implied by expected frequency within a range, plus dates
 * that already have actual income. Markers are planning only.
 *
 * - No expected markers when the expected amount is 0 (nothing planned).
 * - Monthly: anchored to the day-of-month of the most recent income entry
 *   (clamped to short months), else the 1st.
 * - Yearly: anchored to the month/day of the most recent income entry, else Jan 1.
 * - Daily: every day.
 */
export function paydayMarkersInRange(
  expected: ExpectedIncome,
  start: string,
  end: string,
  incomeDates: string[],
): string[] {
  const markers = new Set<string>(incomeDates.filter((d) => inRange(d, start, end)));
  if (!(expected.amount > 0) || !start || !end || start > end) return [...markers].sort();
  const latestIncome = incomeDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop();
  const days = eachDay(start, end);
  if (expected.frequency === 'daily') {
    for (const d of days) markers.add(d);
  } else if (expected.frequency === 'monthly') {
    const anchorDay = latestIncome ? parseLocalDate(latestIncome).getDate() : 1;
    const seen = new Set<string>();
    for (const d of days) {
      const mk = d.slice(0, 7);
      if (seen.has(mk)) continue;
      seen.add(mk);
      const dim = daysInMonth(d);
      const day = Math.min(anchorDay, dim);
      const m = `${mk}-${day < 10 ? `0${day}` : day}`;
      if (inRange(m, start, end)) markers.add(m);
    }
  } else {
    const anchor = latestIncome ? parseLocalDate(latestIncome) : null;
    const am = anchor ? anchor.getMonth() : 0;
    const ad = anchor ? anchor.getDate() : 1;
    const seen = new Set<number>();
    for (const d of days) {
      const y = getYear(d);
      if (seen.has(y)) continue;
      seen.add(y);
      const dim = new Date(y, am + 1, 0).getDate();
      const m = toYMD(new Date(y, am, Math.min(ad, dim)));
      if (inRange(m, start, end)) markers.add(m);
    }
  }
  return [...markers].sort();
}

export function topExpenseTabs(
  entries: Entry[],
  tabs: { id: string; name: string; color: string; isIncome: boolean }[],
  n = 2,
): { tabId: string; name: string; color: string; amount: number }[] {
  const expenseTabs = tabs.filter((t) => !t.isIncome);
  const scored = expenseTabs.map((t) => {
    const tabEntries = entries.filter((e) => e.tabId === t.id);
    return {
      tabId: t.id,
      name: t.name,
      color: t.color,
      amount: spentAmount(tabEntries),
    };
  });
  return scored
    .filter((s) => s.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n);
}

export function monthKey(ymd: string): string {
  return ymd.slice(0, 7); // YYYY-MM
}

export function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return toYMD(d).slice(0, 7);
}

export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned || cleaned === '.' || cleaned.split('.').length > 2) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export { weekRangeMonSun, monthBounds, yearBounds, parseLocalDate };
