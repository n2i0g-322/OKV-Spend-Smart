import type { AppState } from '../types';
import { formatMoney, shiftWeek, weekRangeMonSun } from '../date';
import { filterByRange, topExpenseTabs } from '../money';
import { ChartBuilder } from './ChartBuilder';

interface Props {
  state: AppState;
  selectedDate: string;
  onState: (s: AppState) => void;
  pushUndo: () => void;
}

function PeriodCompare({
  label,
  date,
  state,
}: {
  label: string;
  date: string;
  state: AppState;
}) {
  const w = weekRangeMonSun(date);
  const entries = filterByRange(state.entries, w.start, w.end);
  const top = topExpenseTabs(entries, state.tabs, 2);
  return (
    <div className="compare-period">
      <h4>{label}</h4>
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
}

export function WeekView({ state, selectedDate, onState, pushUndo }: Props) {
  return (
    <div className="period-view">
      <div className="box5 compare-row">
        <PeriodCompare label="This week" date={selectedDate} state={state} />
        <PeriodCompare
          label="Last week"
          date={shiftWeek(selectedDate, -1)}
          state={state}
        />
        <PeriodCompare
          label="Week before"
          date={shiftWeek(selectedDate, -2)}
          state={state}
        />
      </div>
      <ChartBuilder
        state={state}
        selectedDate={selectedDate}
        mode="week"
        onState={onState}
        pushUndo={pushUndo}
      />
    </div>
  );
}
