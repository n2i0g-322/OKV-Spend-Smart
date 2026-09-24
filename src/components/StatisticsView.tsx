import { useMemo } from 'react';
import type { AppState } from '../types';
import {
  daysInMonth,
  eachDay,
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

    // best / worst save day
    if (days.length >= 1) {
      let best = days[0];
      let worst = days[0];
      let bestNet = netSaved(entries.filter((e) => e.date === best));
      let worstNet = bestNet;
      for (const d of days) {
        const n = netSaved(entries.filter((e) => e.date === d));
        if (n > bestNet) {
          bestNet = n;
          best = d;
        }
        if (n < worstNet) {
          worstNet = n;
          worst = d;
        }
      }
      out.push({
        title: 'Best / worst save day',
        body: (
          <>
            Best {formatShortDate(best)} {formatMoney(bestNet)}
            <br />
            Worst {formatShortDate(worst)} {formatMoney(worstNet)}
          </>
        ),
      });
    }

    if (weeks.length >= 1) {
      let best = weeks[0];
      let worst = weeks[0];
      let bestNet = -Infinity;
      let worstNet = Infinity;
      for (const w of weeks) {
        const range = weekRangeMonSun(w);
        const n = netSaved(filterByRange(entries, range.start, range.end));
        if (n > bestNet) {
          bestNet = n;
          best = w;
        }
        if (n < worstNet) {
          worstNet = n;
          worst = w;
        }
      }
      out.push({
        title: 'Best / worst save week',
        body: (
          <>
            Best week of {formatShortDate(best)} {formatMoney(bestNet)}
            <br />
            Worst week of {formatShortDate(worst)} {formatMoney(worstNet)}
          </>
        ),
      });
    }

    if (months.length >= 1) {
      let best = months[0];
      let worst = months[0];
      let bestNet = -Infinity;
      let worstNet = Infinity;
      for (const m of months) {
        const range = monthBounds(m);
        const n = netSaved(filterByRange(entries, range.start, range.end));
        if (n > bestNet) {
          bestNet = n;
          best = m;
        }
        if (n < worstNet) {
          worstNet = n;
          worst = m;
        }
      }
      out.push({
        title: 'Best / worst save month',
        body: (
          <>
            Best {best.slice(0, 7)} {formatMoney(bestNet)}
            <br />
            Worst {worst.slice(0, 7)} {formatMoney(worstNet)}
          </>
        ),
      });
    }

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
      const topTab = [...byTab.entries()].sort((a, b) => b[1] - a[1])[0];
      const topCol = [...byCol.entries()].sort((a, b) => b[1] - a[1])[0];
      if (topTab && topTab[1] > 0) {
        const t = state.tabs.find((x) => x.id === topTab[0]);
        out.push({
          title: 'Most expensive tab (all-time)',
          body: (
            <>
              {t?.name} {formatMoney(topTab[1])}
            </>
          ),
        });
      }
      if (topCol && topCol[1] > 0) {
        const c = state.columns.find((x) => x.id === topCol[0]);
        out.push({
          title: 'Most expensive column (all-time)',
          body: (
            <>
              {c?.name} {formatMoney(topCol[1])}
            </>
          ),
        });
      }

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
              This: in {formatMoney(incomeAmount(tEnt))} / out{' '}
              {formatMoney(spentAmount(tEnt))} / net {formatMoney(netSaved(tEnt))}
              <br />
              Last: in {formatMoney(incomeAmount(lEnt))} / out{' '}
              {formatMoney(spentAmount(lEnt))} / net {formatMoney(netSaved(lEnt))}
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

    // projected month-end
    {
      const thisM = monthBounds(selectedDate);
      const tEnt = filterByRange(entries, thisM.start, thisM.end);
      const daysWith = uniqueDays(tEnt).length;
      if (daysWith >= 2) {
        const avgDaily = netSaved(tEnt) / daysWith;
        const dim = daysInMonth(selectedDate);
        const projected = avgDaily * dim;
        out.push({
          title: 'Projected month-end net',
          body: (
            <>
              If current daily average ({formatMoney(avgDaily)}) continues:{' '}
              {formatMoney(projected)}
            </>
          ),
        });
      }
    }

    const avgs = averages(entries);
    out.push({
      title: 'All-time snapshot',
      body: (
        <>
          Net {formatMoney(avgs.allTime)} across {avgs.daysWithData} days /{' '}
          {avgs.weeksWithData} weeks / {avgs.monthsWithData} months with data.
        </>
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

// keep imports used
void eachDay;
