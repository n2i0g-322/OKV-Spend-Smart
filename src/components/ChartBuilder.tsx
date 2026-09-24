import { useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Line, Pie } from 'react-chartjs-2';
import type { AppState, ChartConfig, ChartGroupBy, ChartMetric, ChartRange, ChartType } from '../types';
import {
  addDays,
  eachDay,
  formatMoney,
  getYear,
  monthBounds,
  shiftMonth,
  shiftWeek,
  shiftYear,
  weekRangeMonSun,
  yearBounds,
} from '../date';
import { filterByRange, incomeAmount, netSaved, spentAmount } from '../money';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { ChipWithMenu } from './ChipWithMenu';

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
);

interface Props {
  state: AppState;
  selectedDate: string;
  mode: 'week' | 'month' | 'year';
  onState: (s: AppState) => void;
  pushUndo: () => void;
}

function resolveRange(
  range: ChartRange,
  selectedDate: string,
): { start: string; end: string } {
  const week = weekRangeMonSun(selectedDate);
  const month = monthBounds(selectedDate);
  const year = yearBounds(selectedDate);
  switch (range) {
    case 'this week':
      return week;
    case 'last week': {
      const p = weekRangeMonSun(shiftWeek(selectedDate, -1));
      return p;
    }
    case 'last 3 weeks': {
      const start = weekRangeMonSun(shiftWeek(selectedDate, -2)).start;
      return { start, end: week.end };
    }
    case 'this month':
      return month;
    case 'last month':
      return monthBounds(shiftMonth(selectedDate, -1));
    case 'last 3 months': {
      const start = monthBounds(shiftMonth(selectedDate, -2)).start;
      return { start, end: month.end };
    }
    case 'last 12 months': {
      const start = monthBounds(shiftMonth(selectedDate, -11)).start;
      return { start, end: month.end };
    }
    case 'this year':
      return year;
    case 'last year':
      return yearBounds(shiftYear(selectedDate, -1));
    case 'last 3 years': {
      const y = getYear(selectedDate);
      return { start: `${y - 2}-01-01`, end: year.end };
    }
    default:
      return week;
  }
}

function rangesFor(mode: Props['mode']): ChartRange[] {
  if (mode === 'week') return ['this week', 'last week', 'last 3 weeks'];
  if (mode === 'month')
    return ['this month', 'last month', 'last 3 months', 'last 12 months'];
  return ['this year', 'last year', 'last 3 years'];
}

function groupsFor(mode: Props['mode']): ChartGroupBy[] {
  if (mode === 'week') return ['tab', 'column', 'day'];
  if (mode === 'month') return ['tab', 'column', 'day', 'week'];
  return ['tab', 'column', 'month'];
}

export function ChartBuilder({ state, selectedDate, mode, onState, pushUndo }: Props) {
  const [selectedId, setSelectedId] = useState(state.charts[0]?.id ?? null);
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [draft, setDraft] = useState<Omit<ChartConfig, 'id'>>({
    name: 'New chart',
    type: 'bar',
    metric: 'spent',
    groupBy: mode === 'year' ? 'month' : 'day',
    range: rangesFor(mode)[0],
  });

  const chart = state.charts.find((c) => c.id === selectedId) ?? state.charts[0];

  const data = useMemo(() => {
    if (!chart) return null;
    const { start, end } = resolveRange(chart.range, selectedDate);
    const entries = filterByRange(state.entries, start, end);
    const labels: string[] = [];
    const values: number[] = [];
    const colors: string[] = [];

    const metricOf = (list: typeof entries) => {
      if (chart.metric === 'spent') return spentAmount(list);
      if (chart.metric === 'income') return incomeAmount(list);
      return netSaved(list);
    };

    if (chart.groupBy === 'tab') {
      for (const t of state.tabs.filter((t) => !t.isIncome || chart.metric === 'income')) {
        const list = entries.filter((e) => e.tabId === t.id);
        const v = metricOf(list);
        if (v === 0 && chart.type === 'pie') continue;
        labels.push(t.name);
        values.push(v);
        colors.push(t.color);
      }
    } else if (chart.groupBy === 'column') {
      for (const c of state.columns) {
        const list = entries.filter((e) => e.columnId === c.id);
        const v = metricOf(list);
        if (v === 0 && chart.type === 'pie') continue;
        labels.push(c.name);
        values.push(v);
        colors.push(c.color);
      }
    } else if (chart.groupBy === 'day') {
      // For week ranges prefer Mon–Sun axis of the selected week when range is this/last week
      let days = eachDay(start, end);
      if (chart.range === 'this week' || chart.range === 'last week') {
        const w =
          chart.range === 'this week'
            ? weekRangeMonSun(selectedDate)
            : weekRangeMonSun(shiftWeek(selectedDate, -1));
        days = eachDay(w.start, w.end);
      }
      for (const d of days) {
        labels.push(d.slice(5)); // MM-DD
        values.push(metricOf(entries.filter((e) => e.date === d)));
        colors.push('#22c55e');
      }
    } else if (chart.groupBy === 'week') {
      let cur = weekRangeMonSun(start).start;
      while (cur <= end) {
        const w = weekRangeMonSun(cur);
        labels.push(w.start.slice(5));
        values.push(metricOf(filterByRange(entries, w.start, w.end)));
        colors.push('#3b82f6');
        cur = addDays(w.end, 1);
      }
    } else if (chart.groupBy === 'month') {
      let cur = monthBounds(start).start;
      while (cur <= end) {
        const m = monthBounds(cur);
        labels.push(cur.slice(0, 7));
        values.push(metricOf(filterByRange(entries, m.start, m.end)));
        colors.push('#a855f7');
        cur = shiftMonth(cur, 1);
        cur = monthBounds(cur).start;
      }
    }

    const empty = values.every((v) => v === 0);
    return { labels, values, colors, empty };
  }, [chart, state, selectedDate]);

  const chartMenu = (c: ChartConfig, x: number, y: number) => {
    setMenu({
      x,
      y,
      items: [
        {
          label: 'Rename',
          onClick: () => {
            const name = prompt('Rename chart', c.name);
            if (!name?.trim()) return;
            pushUndo();
            onState({
              ...state,
              charts: state.charts.map((x) =>
                x.id === c.id ? { ...x, name: name.trim() } : x,
              ),
            });
          },
        },
        {
          label: 'Duplicate',
          onClick: () => {
            pushUndo();
            const copy = { ...c, id: crypto.randomUUID(), name: `${c.name} copy` };
            onState({ ...state, charts: [...state.charts, copy] });
            setSelectedId(copy.id);
          },
        },
        {
          label: 'Delete',
          danger: true,
          onClick: () => {
            pushUndo();
            const charts = state.charts.filter((x) => x.id !== c.id);
            onState({ ...state, charts });
            setSelectedId(charts[0]?.id ?? null);
          },
        },
      ],
    });
  };

  const dataset = data
    ? {
        labels: data.labels,
        datasets: [
          {
            label: chart?.name ?? '',
            data: data.values,
            backgroundColor: data.colors,
            borderColor: data.colors,
            borderWidth: chart?.type === 'line' ? 2 : 1,
          },
        ],
      }
    : null;

  return (
    <div className="chart-builder">
      <div className="box6 charts-list">
        <h3>Charts</h3>
        <ul>
          {state.charts.map((c) => (
            <ChipWithMenu
              key={c.id}
              as="li"
              className={selectedId === c.id || chart?.id === c.id ? 'active' : ''}
              onMenu={(x, y) => chartMenu(c, x, y)}
            >
              <button type="button" onClick={() => setSelectedId(c.id)}>
                {c.name}
              </button>
              <button
                type="button"
                className="icon-btn tiny"
                onClick={(e) => chartMenu(c, e.clientX, e.clientY)}
              >
                ⋯
              </button>
            </ChipWithMenu>
          ))}
        </ul>
        <button type="button" className="btn ghost" onClick={() => setAdding(true)}>
          + Add chart
        </button>
        {adding && (
          <div className="add-chart-form">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Name"
            />
            <select
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value as ChartType })}
            >
              <option value="bar">bar</option>
              <option value="line">line</option>
              <option value="pie">pie</option>
            </select>
            <select
              value={draft.metric}
              onChange={(e) => setDraft({ ...draft, metric: e.target.value as ChartMetric })}
            >
              <option value="spent">spent</option>
              <option value="saved">saved</option>
              <option value="income">income</option>
            </select>
            <select
              value={draft.groupBy}
              onChange={(e) =>
                setDraft({ ...draft, groupBy: e.target.value as ChartGroupBy })
              }
            >
              {groupsFor(mode).map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <select
              value={draft.range}
              onChange={(e) => setDraft({ ...draft, range: e.target.value as ChartRange })}
            >
              {rangesFor(mode).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <div className="row-actions">
              <button type="button" className="btn ghost" onClick={() => setAdding(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  pushUndo();
                  const c: ChartConfig = { ...draft, id: crypto.randomUUID() };
                  onState({ ...state, charts: [...state.charts, c] });
                  setSelectedId(c.id);
                  setAdding(false);
                }}
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="box7 chart-panel">
        {!chart || !dataset || data?.empty ? (
          <div className="empty-chart">
            <p>No chart data yet.</p>
            <p className="muted">Add expenses or income to see {chart?.name ?? 'charts'}.</p>
          </div>
        ) : chart.type === 'pie' ? (
          <Pie data={dataset} />
        ) : chart.type === 'line' ? (
          <Line data={dataset} options={{ responsive: true, plugins: { legend: { display: false } } }} />
        ) : (
          <Bar data={dataset} options={{ responsive: true, plugins: { legend: { display: false } } }} />
        )}
        {chart && !data?.empty && (
          <p className="muted small">
            {chart.name}: {chart.metric} by {chart.groupBy} ({chart.range}) · total{' '}
            {formatMoney(data?.values.reduce((a, b) => a + b, 0) ?? 0)}
          </p>
        )}
      </div>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}
