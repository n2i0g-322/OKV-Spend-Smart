import type { Entry, ExpectedIncome, PaySchedule } from './types';
import {
  addDays,
  daysBetween,
  daysInMonth,
  localToday,
  monthsOverlapping,
  weeksOverlapping,
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

/** Median of a list of cents values (returns cents). */
function medianCents(list: number[]): number {
  const a = [...list].sort((x, y) => x - y);
  const n = a.length;
  if (!n) return 0;
  return n % 2 ? a[(n - 1) / 2] : Math.round((a[n / 2 - 1] + a[n / 2]) / 2);
}

function netCents(entries: Entry[]): number {
  let c = 0;
  for (const e of entries) {
    if (e.type === 'income' || e.type === 'refund') c += toCents(e.amount);
    else if (e.type === 'expense') c -= toCents(e.amount);
  }
  return c;
}

export interface CalendarAverages {
  hasData: boolean;
  allTime: number;
  spanStart: string;
  spanEnd: string;
  calendarDays: number;
  calendarWeeks: number;
  calendarMonths: number;
  avgDaily: number;
  avgWeekly: number;
  avgMonthly: number;
  /** Old figure: net ÷ days that have entries (shown muted). */
  daysWithData: number;
  perDayWithEntries: number;
  /** true when spanEnd is the end of a past range rather than today. */
  pastRange: boolean;
}

/**
 * Box 4 — calendar averages.
 * spanStart = first entry date; spanEnd = today, or the last day of a past range
 * (when `rangeEnd` is before today). If entries exist after today and the range is
 * current, spanEnd extends to the last entry so all-time really is all-time.
 * Empty days/weeks/months inside the span count.
 */
export function calendarAverages(
  entries: Entry[],
  rangeEnd?: string,
  today: string = localToday(),
): CalendarAverages {
  const dated = entries.filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date));
  const pastRange = !!rangeEnd && rangeEnd < today;
  let spanEnd = pastRange ? rangeEnd! : today;
  if (!pastRange) for (const e of dated) if (e.date > spanEnd) spanEnd = e.date;
  const inSpan = dated.filter((e) => e.date <= spanEnd);
  const spanStart = inSpan.reduce((m, e) => (e.date < m ? e.date : m), '9999-12-31');
  const empty: CalendarAverages = {
    hasData: false, allTime: 0, spanStart: '', spanEnd, calendarDays: 0, calendarWeeks: 0, calendarMonths: 0,
    avgDaily: 0, avgWeekly: 0, avgMonthly: 0, daysWithData: 0, perDayWithEntries: 0, pastRange,
  };
  if (!inSpan.length) return empty;
  const net = netCents(inSpan);
  const days = daysBetween(spanStart, spanEnd) + 1;
  const weeks = weeksOverlapping(spanStart, spanEnd);
  const months = monthsOverlapping(spanStart, spanEnd);
  const dwd = new Set(inSpan.map((e) => e.date)).size;
  const r = (c: number, n: number) => roundCents(c / 100 / n);
  return {
    hasData: true,
    allTime: net === 0 ? 0 : net / 100,
    spanStart,
    spanEnd,
    calendarDays: days,
    calendarWeeks: weeks,
    calendarMonths: months,
    avgDaily: r(net, days),
    avgWeekly: r(net, weeks),
    avgMonthly: r(net, months),
    daysWithData: dwd,
    perDayWithEntries: r(net, dwd),
    pastRange,
  };
}

export type MonthEnd =
  | { kind: 'final'; net: number; monthStart: string; monthEnd: string; hasEntries: boolean }
  | { kind: 'projected'; mtd: number; daysElapsed: number; daysInMonth: number; remaining: number; pace: number; projected: number; monthStart: string; monthEnd: string }
  | { kind: 'future'; monthStart: string; monthEnd: string }
  | { kind: 'nodata'; monthStart: string; monthEnd: string };

/**
 * Month-end net for the month containing `ymd`.
 * Past month → actual final net. Current month → MTD + remaining days × (MTD ÷ days 1st..today).
 */
export function monthEndNet(entries: Entry[], ymd: string, today: string = localToday()): MonthEnd {
  const { start, end } = monthBounds(ymd);
  if (end < today) {
    const list = filterByRange(entries, start, end);
    return { kind: 'final', net: netSaved(list), monthStart: start, monthEnd: end, hasEntries: list.length > 0 };
  }
  if (start > today) return { kind: 'future', monthStart: start, monthEnd: end };
  const mtdList = filterByRange(entries, start, today);
  if (!mtdList.length) return { kind: 'nodata', monthStart: start, monthEnd: end };
  const mtdC = netCents(mtdList);
  const elapsed = daysBetween(start, today) + 1;
  const dim = daysInMonth(ymd);
  const remaining = dim - elapsed;
  const paceC = mtdC / elapsed;
  return {
    kind: 'projected',
    mtd: mtdC / 100 || 0,
    daysElapsed: elapsed,
    daysInMonth: dim,
    remaining,
    pace: roundCents(paceC / 100),
    projected: roundCents((mtdC + remaining * paceC) / 100),
    monthStart: start,
    monthEnd: end,
  };
}

/** Scheduled payday marker dates in [start, end] (planning only). Periodic in both directions from the anchor. */
export function scheduledPaydays(schedule: PaySchedule | null | undefined, start: string, end: string): string[] {
  if (!schedule || !/^\d{4}-\d{2}-\d{2}$/.test(schedule.anchor) || !start || !end || start > end) return [];
  const out: string[] = [];
  const { frequency, anchor } = schedule;
  if (frequency === 'daily') return eachDay(start, end);
  if (frequency === 'weekly' || frequency === 'biweekly') {
    const step = frequency === 'weekly' ? 7 : 14;
    const off = ((daysBetween(anchor, start) % step) + step) % step;
    for (let d = off === 0 ? start : addDays(start, step - off); d <= end; d = addDays(d, step)) out.push(d);
    return out;
  }
  // monthly: anchor day-of-month, clamped to month length
  const aDay = parseLocalDate(anchor).getDate();
  const s = parseLocalDate(start);
  for (let m = 0; ; m++) {
    const first = new Date(s.getFullYear(), s.getMonth() + m, 1);
    if (toYMD(first) > end) break;
    const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const d = toYMD(new Date(first.getFullYear(), first.getMonth(), Math.min(aDay, dim)));
    if (d >= start && d <= end) out.push(d);
  }
  return out;
}

export interface PaydayMarker {
  date: string;
  scheduled: boolean;
  income: boolean;
}

/** Payday markers = scheduled paydays ∪ dates that already have a real income entry. Markers only. */
export function paydayMarkers(
  schedule: PaySchedule | null | undefined,
  start: string,
  end: string,
  incomeDates: string[],
): PaydayMarker[] {
  const m = new Map<string, PaydayMarker>();
  for (const d of scheduledPaydays(schedule, start, end)) m.set(d, { date: d, scheduled: true, income: false });
  for (const d of incomeDates) {
    if (!inRange(d, start, end)) continue;
    const cur = m.get(d);
    m.set(d, { date: d, scheduled: cur?.scheduled ?? false, income: true });
  }
  return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** @deprecated compatibility wrapper: marker dates only. */
export function paydayMarkersInRange(
  schedule: PaySchedule | null | undefined,
  start: string,
  end: string,
  incomeDates: string[],
): string[] {
  return paydayMarkers(schedule, start, end, incomeDates).map((x) => x.date);
}

export interface WeekActual {
  start: string;
  end: string;
  income: number;
  out: number;
  net: number;
  hasIncome: boolean;
  hasPaydayMarker: boolean;
}

export function weekActual(entries: Entry[], schedule: PaySchedule | null | undefined, ymd: string): WeekActual {
  const w = weekRangeMonSun(ymd);
  const list = filterByRange(entries, w.start, w.end);
  const inc = sumByType(list, 'income');
  const out = roundCents(sumByType(list, 'expense') - sumByType(list, 'refund'));
  return {
    start: w.start,
    end: w.end,
    income: inc,
    out,
    net: netSaved(list),
    hasIncome: list.some((e) => e.type === 'income'),
    hasPaydayMarker: scheduledPaydays(schedule, w.start, w.end).length > 0,
  };
}

export interface TypicalWeek {
  hasData: boolean;
  value: number;
  method: 'mean' | 'median' | 'none';
  weeksUsed: WeekActual[];
  completedWeeks: number;
  thisWeek: WeekActual;
  thisWeekIsPayday: boolean;
}

/**
 * Box 1 — typical week's net.
 * Mean net of the last 12 completed Mon–Sun weeks (on/after the first entry's week,
 * before the selected week and before today) that have NO payday marker and NO income entry.
 * If fewer than 2 such weeks: median of all available completed weeks.
 */
export function typicalWeek(
  entries: Entry[],
  schedule: PaySchedule | null | undefined,
  selectedDate: string,
  today: string = localToday(),
): TypicalWeek {
  const thisWeek = weekActual(entries, schedule, selectedDate);
  const thisWeekIsPayday = thisWeek.hasIncome || thisWeek.hasPaydayMarker;
  const dated = entries.filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date));
  const first = dated.reduce((m, e) => (e.date < m ? e.date : m), '9999-12-31');
  const base = { thisWeek, thisWeekIsPayday };
  if (!dated.length) return { ...base, hasData: false, value: 0, method: 'none', weeksUsed: [], completedWeeks: 0 };
  const cutoff = thisWeek.start < today ? thisWeek.start : today; // completed = ends before this
  const firstWeek = weekRangeMonSun(first).start;
  const completed: WeekActual[] = [];
  for (let w = weekRangeMonSun(addDays(cutoff, -1)).start; w >= firstWeek; w = addDays(w, -7)) {
    if (addDays(w, 6) >= cutoff) continue;
    completed.push(weekActual(entries, schedule, w));
  }
  const clean = completed.filter((w) => !w.hasIncome && !w.hasPaydayMarker).slice(0, 12);
  if (clean.length >= 2) {
    const c = clean.reduce((s, w) => s + toCents(w.net), 0);
    return { ...base, hasData: true, value: roundCents(c / clean.length / 100), method: 'mean', weeksUsed: clean, completedWeeks: completed.length };
  }
  if (!completed.length) return { ...base, hasData: false, value: 0, method: 'none', weeksUsed: [], completedWeeks: 0 };
  return {
    ...base,
    hasData: true,
    value: medianCents(completed.map((w) => toCents(w.net))) / 100,
    method: 'median',
    weeksUsed: completed,
    completedWeeks: completed.length,
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
