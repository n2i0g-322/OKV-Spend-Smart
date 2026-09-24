import { useMemo } from 'react';
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import type { AppState } from '../types';
import {
  formatMoney,
  getYear,
  monthBounds,
  pad2,
  shiftYear,
  yearBounds,
} from '../date';
import { filterByRange, netSaved, topExpenseTabs } from '../money';
import { ChartBuilder } from './ChartBuilder';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

interface Props {
  state: AppState;
  selectedDate: string;
  onState: (s: AppState) => void;
  pushUndo: () => void;
}

export function YearView({ state, selectedDate, onState, pushUndo }: Props) {
  const year = getYear(selectedDate);
  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const ymd = `${year}-${pad2(i + 1)}-15`;
      const b = monthBounds(ymd);
      return {
        label: new Date(year, i, 1).toLocaleString('en-CA', { month: 'short' }),
        net: netSaved(filterByRange(state.entries, b.start, b.end)),
      };
    });
  }, [state.entries, year]);

  const periods = [
    { label: `This year (${year})`, date: selectedDate },
    { label: `Last year (${year - 1})`, date: shiftYear(selectedDate, -1) },
    { label: `Year before (${year - 2})`, date: shiftYear(selectedDate, -2) },
  ];

  return (
    <div className="period-view year-view">
      <div className="year-primary card">
        <h3>{year} — net saved by month</h3>
        <Bar
          data={{
            labels: months.map((m) => m.label),
            datasets: [
              {
                label: 'Net saved',
                data: months.map((m) => m.net),
                backgroundColor: months.map((m) =>
                  m.net >= 0 ? '#22c55e' : '#ef4444',
                ),
              },
            ],
          }}
          options={{
            responsive: true,
            plugins: { legend: { display: false } },
          }}
        />
      </div>

      <div className="box5 compare-row">
        {periods.map((p) => {
          const yb = yearBounds(p.date);
          const entries = filterByRange(state.entries, yb.start, yb.end);
          if (entries.length === 0) return null;
          const top = topExpenseTabs(entries, state.tabs, 2);
          return (
            <div className="compare-period" key={p.label}>
              <h4>{p.label}</h4>
              {top.length === 0 ? (
                <p className="muted">No data.</p>
              ) : (
                <ul>
                  {top.map((t) => (
                    <li key={t.tabId}>
                      <span className="dot" style={{ background: t.color }} />
                      {t.name} <strong>{formatMoney(t.amount)}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <ChartBuilder
        state={state}
        selectedDate={selectedDate}
        mode="year"
        onState={onState}
        pushUndo={pushUndo}
      />
    </div>
  );
}
