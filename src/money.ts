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

/** Net for a set of entries: income − expenses + refunds (refunds reduce spend). */
export function netSaved(entries: Entry[]): number {
  let income = 0;
  let expense = 0;
  let refund = 0;
  for (const e of entries) {
    if (e.type === 'income') income += e.amount;
    else if (e.type === 'expense') expense += e.amount;
    else if (e.type === 'refund') refund += e.amount;
  }
  return income - expense + refund;
}

export function sumByType(entries: Entry[], type: Entry['type']): number {
  return entries.filter((e) => e.type === type).reduce((s, e) => s + e.amount, 0);
}

/** Spent = expenses − refunds (never negative per call site preference; clamp at 0 optional). */
export function spentAmount(entries: Entry[]): number {
  return Math.max(0, sumByType(entries, 'expense') - sumByType(entries, 'refund'));
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
    if (e.type === 'expense' || e.type === 'income') t += e.amount;
    else if (e.type === 'refund') t -= e.amount;
  }
  return t;
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
    avgMonthly: monthsWithData ? allTime / monthsWithData : 0,
    avgWeekly: weeksWithData ? allTime / weeksWithData : 0,
    avgDaily: daysWithData ? allTime / daysWithData : 0,
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
  if (expected.frequency === 'daily') return expected.amount * dim;
  if (expected.frequency === 'monthly') return expected.amount;
  // yearly
  const year = getYear(ymdInMonth);
  const days = isLeapYear(year) ? 366 : 365;
  return (expected.amount / days) * dim;
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

/** Payday marker dates implied by expected frequency within a range. */
export function paydayMarkersInRange(
  expected: ExpectedIncome,
  start: string,
  end: string,
  incomeDates: string[],
): string[] {
  const markers = new Set<string>(incomeDates.filter((d) => inRange(d, start, end)));
  const days = eachDay(start, end);
  if (expected.frequency === 'daily') {
    for (const d of days) markers.add(d);
  } else if (expected.frequency === 'monthly') {
    // mark the 1st of each month in range (and months that touch range)
    const seen = new Set<string>();
    for (const d of days) {
      const first = monthBounds(d).start;
      if (!seen.has(first) && inRange(first, start, end)) {
        markers.add(first);
        seen.add(first);
      }
    }
  } else {
    // yearly — Jan 1
    for (const d of days) {
      const jan1 = `${getYear(d)}-01-01`;
      if (inRange(jan1, start, end)) markers.add(jan1);
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
  if (!cleaned || cleaned === '.') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export { weekRangeMonSun, monthBounds, yearBounds, parseLocalDate };
