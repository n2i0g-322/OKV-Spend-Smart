import { useMemo } from 'react';
import type { AppState } from '../types';
import {
  formatMonthYear,
  formatMoney,
  formatShortDate,
  localToday,
  monthBounds,
  parseLocalDate,
  shiftMonth,
  weekRangeMonSun,
  yearBounds,
} from '../date';
import {
  averages,
  calendarAverages,
  monthEndNet,
  expectedForMonth,
  filterByRange,
  incomeAmount,
  netSaved,
  spentAmount,
  uniqueDays,
  uniqueMonths,
  uniqueWeeks,
} from '../money';

interface Props {
  state: AppState;
  selectedDate: string;
}

export function StatisticsView({ state, selectedDate }: Props) {
  const cards = useMemo(() => {
    const entries = state.entries;
    const out: { title: string; body: React.ReactNode }[] = [];
    if (entries.length === 0) return out;

    const days = uniqueDays(entries);
    const weeks = uniqueWeeks(entries);
    const months = uniqueMonths(entries);

    // best / worst save day / week / month — every tied period is listed
    const bw = (
      title: string,
      unit: string,
      items: { label: string; net: number }[],
    ) => {
      if (items.length < 2) {
        out.push({ title, body: <>Not enough data yet.</> });
        return;
      }
      const cents = items.map((i) => Math.round(i.net * 100));
      const max = Math.max(...cents);
      const min = Math.min(...cents);
      const best = items.filter((_, i) => cents[i] === max).map((i) => i.label);
      const worst = items.filter((_, i) => cents[i] === min).map((i) => i.label);
      out.push({
        title,
        body:
          max === min ? (
            <>
              All {items.length} {unit}s tied at {formatMoney(max / 100)}: {best.join(', ')}
            </>
          ) : (
            <>
              Best {formatMoney(max / 100)} — {best.join(', ')}
              {best.length > 1 ? ` (${best.length}-way tie)` : ''}
              <br />
              Worst {formatMoney(min / 100)} — {worst.join(', ')}
              {worst.length > 1 ? ` (${worst.length}-way tie)` : ''}
            </>
          ),
      });
    };
    bw(
      'Best / worst save day',
      'day',
      days.map((d) => ({ label: formatShortDate(d), net: netSaved(entries.filter((e) => e.date === d)) })),
    );
    bw(
      'Best / worst save week',
      'week',
      weeks.map((w) => {
        const r = weekRangeMonSun(w);
        return { label: `week of ${formatShortDate(r.start)}`, net: netSaved(filterByRange(entries, r.start, r.end)) };
      }),
    );
    bw(
      'Best / worst save month',
      'month',
      months.map((m) => {
        const r = monthBounds(m);
        return { label: formatMonthYear(r.start), net: netSaved(filterByRange(entries, r.start, r.end)) };
      }),
    );

    // most expensive tab/column
    const expenseEntries = entries.filter((e) => e.type === 'expense' || e.type === 'refund');
    if (expenseEntries.length) {
      const byTab = new Map<string, number>();
      const byCol = new Map<string, number>();
      for (const t of state.tabs.filter((t) => !t.isIncome)) {
        byTab.set(t.id, spentAmount(entries.filter((e) => e.tabId === t.id)));
      }
      for (const c of state.columns) {
        byCol.set(c.id, spentAmount(entries.filter((e) => e.columnId === c.id)));
      }
      const tops = (m: Map<string, number>) => {
        const max = Math.max(0, ...[...m.values()].map((v) => Math.round(v * 100)));
        return { max: max / 100, ids: max > 0 ? [...m.entries()].filter(([, v]) => Math.round(v * 100) === max).map(([k]) => k) : [] };
      };
      const tt = tops(byTab);
      const tc = tops(byCol);
      out.push({
        title: 'Most expensive tab (all-time)',
        body: tt.ids.length ? (
          <>
            {tt.ids.map((id) => state.tabs.find((x) => x.id === id)?.name).join(', ')} {formatMoney(tt.max)}
            {tt.ids.length > 1 ? ' (tie)' : ''}
          </>
        ) : (
          <>Not enough data yet.</>
        ),
      });
      out.push({
        title: 'Most expensive column (all-time)',
        body: tc.ids.length ? (
          <>
            {tc.ids.map((id) => state.columns.find((x) => x.id === id)?.name).join(', ')} {formatMoney(tc.max)}
            {tc.ids.length > 1 ? ' (tie)' : ''}
          </>
        ) : (
          <>Not enough data yet.</>
        ),
      });

      const yb = yearBounds(selectedDate);
      const yearEntries = filterByRange(entries, yb.start, yb.end);
      if (yearEntries.length) {
        const yTab = state.tabs
          .filter((t) => !t.isIncome)
          .map((t) => ({
            t,
            a: spentAmount(yearEntries.filter((e) => e.tabId === t.id)),
          }))
          .sort((a, b) => b.a - a.a)[0];
        if (yTab && yTab.a > 0) {
          out.push({
            title: 'Most expensive tab (this year)',
            body: (
              <>
                {yTab.t.name} {formatMoney(yTab.a)}
              </>
            ),
          });
        }
      }
    }

    // avg spend per weekday
    if (days.length >= 3) {
      const buckets = Array.from({ length: 7 }, () => ({ sum: 0, n: 0 }));
      for (const d of days) {
        const dow = parseLocalDate(d).getDay(); // 0 Sun
        const mon0 = dow === 0 ? 6 : dow - 1;
        buckets[mon0].sum += spentAmount(entries.filter((e) => e.date === d));
        buckets[mon0].n++;
      }
      const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      out.push({
        title: 'Average spend per weekday',
        body: (
          <ul className="stat-list">
            {names.map((n, i) => (
              <li key={n}>
                {n}:{' '}
                {buckets[i].n
                  ? formatMoney(buckets[i].sum / buckets[i].n)
                  : '—'}
              </li>
            ))}
          </ul>
        ),
      });
    }

    // streak
    {
      const set = new Set(days);
      let streak = 0;
      let cur = localToday();
      // if today has no entry, start from yesterday
      if (!set.has(cur)) {
        const y = parseLocalDate(cur);
        y.setDate(y.getDate() - 1);
        cur = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
      }
      while (set.has(cur)) {
        streak++;
        const y = parseLocalDate(cur);
        y.setDate(y.getDate() - 1);
        cur = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
      }
      if (streak > 0) {
        out.push({
          title: 'Current logging streak',
          body: <>{streak} day{streak === 1 ? '' : 's'} with ≥1 entry</>,
        });
      }
    }

    // spend share by tab
    {
      const total = spentAmount(entries);
      if (total > 0) {
        const shares = state.tabs
          .filter((t) => !t.isIncome)
          .map((t) => ({
            t,
            a: spentAmount(entries.filter((e) => e.tabId === t.id)),
          }))
          .filter((x) => x.a > 0)
          .sort((a, b) => b.a - a.a);
        out.push({
          title: 'Spend share by tab',
          body: (
            <ul className="stat-list">
              {shares.map(({ t, a }) => (
                <li key={t.id}>
                  <span className="dot" style={{ background: t.color }} />
                  {t.name}: {((a / total) * 100).toFixed(0)}% ({formatMoney(a)})
                </li>
              ))}
            </ul>
          ),
        });
      }
    }

    // income vs expenses this vs last month
    {
      const thisM = monthBounds(selectedDate);
      const lastM = monthBounds(shiftMonth(selectedDate, -1));
      const tEnt = filterByRange(entries, thisM.start, thisM.end);
      const lEnt = filterByRange(entries, lastM.start, lastM.end);
      if (tEnt.length || lEnt.length) {
        out.push({
          title: 'Income vs expenses (this vs last month)',
          body: (
            <>
              This ({formatMonthYear(thisM.start)}):{' '}
              {tEnt.length ? (
                <>
                  in {formatMoney(incomeAmount(tEnt))} / out {formatMoney(spentAmount(tEnt))} / net{' '}
                  {formatMoney(netSaved(tEnt))}
                </>
              ) : (
                'Not enough data yet.'
              )}
              <br />
              Last ({formatMonthYear(lastM.start)}):{' '}
              {lEnt.length ? (
                <>
                  in {formatMoney(incomeAmount(lEnt))} / out {formatMoney(spentAmount(lEnt))} / net{' '}
                  {formatMoney(netSaved(lEnt))}
                </>
              ) : (
                'Not enough data yet.'
              )}
            </>
          ),
        });
      }
    }

    // expected vs actual
    {
      const thisM = monthBounds(selectedDate);
      const actual = incomeAmount(filterByRange(entries, thisM.start, thisM.end));
      const expected = expectedForMonth(state.expectedIncome, selectedDate);
      if (expected > 0 || actual > 0) {
        out.push({
          title: 'Expected vs actual income (this month)',
          body: (
            <>
              Plan {formatMoney(expected)} · Actual {formatMoney(actual)} · Diff{' '}
              {formatMoney(actual - expected)}
            </>
          ),
        });
      }
    }

    // uncategorized count
    {
      const unc = state.tabs.find((t) => t.isSystem || t.name === 'Uncategorized');
      if (unc) {
        const thisM = monthBounds(selectedDate);
        const n = filterByRange(entries, thisM.start, thisM.end).filter(
          (e) => e.tabId === unc.id,
        ).length;
        out.push({
          title: 'Uncategorized this month',
          body: <>{n} entr{n === 1 ? 'y' : 'ies'}</>,
        });
      }
    }

    // month-end net: past month = final actual; current month = calendar pace (zero days count)
    {
      const me = monthEndNet(entries, selectedDate, localToday());
      const label = formatMonthYear(me.monthStart);
      out.push({
        title: me.kind === 'final' ? `Month-end net — ${label}` : `Projected month-end net — ${label}`,
        body:
          me.kind === 'final' ? (
            me.hasEntries ? (
              <span data-testid="final-net">
                Final net <strong>{formatMoney(me.net)}</strong> (month complete — actual, no projection)
              </span>
            ) : (
              <>Not enough data yet.</>
            )
          ) : me.kind === 'projected' ? (
            <span data-testid="projected-net">
              Projected <strong>{formatMoney(me.projected)}</strong> = month-to-date {formatMoney(me.mtd)} +{' '}
              {me.remaining} remaining day{me.remaining === 1 ? '' : 's'} × {formatMoney(me.pace)}/day
              <br />
              <span className="muted small">
                Pace = MTD net ÷ {me.daysElapsed} calendar day{me.daysElapsed === 1 ? '' : 's'} (1st through today, zero days
                count).
              </span>
            </span>
          ) : (
            <>Not enough data yet.</>
          ),
      });
    }

    const ca = calendarAverages(entries, undefined, localToday());
    const avgs = averages(entries);
    out.push({
      title: 'All-time snapshot',
      body: ca.hasData ? (
        <>
          Net {formatMoney(ca.allTime)} over {ca.calendarDays} calendar days / {ca.calendarWeeks} Mon–Sun weeks /{' '}
          {ca.calendarMonths} months ({formatShortDate(ca.spanStart)}, {ca.spanStart.slice(0, 4)} – {formatShortDate(ca.spanEnd)},{' '}
          {ca.spanEnd.slice(0, 4)}). {avgs.daysWithData} days have entries.
        </>
      ) : (
        <>Not enough data yet.</>
      ),
    });

    return out;
  }, [state, selectedDate]);

  if (cards.length === 0) {
    return (
      <div className="stats-view">
        <p className="muted">Not enough data yet. Add some entries to see statistics.</p>
      </div>
    );
  }

  return (
    <div className="stats-view">
      <div className="stats-grid">
        {cards.map((c) => (
          <article key={c.title} className="card stat-card">
            <h3>{c.title}</h3>
            <div>{c.body}</div>
          </article>
        ))}
      </div>
    </div>
  );
}
