import type { AppState } from '../types';
import { formatMoney, monthBounds, shiftMonth } from '../date';
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
  const m = monthBounds(date);
  const entries = filterByRange(state.entries, m.start, m.end);
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

export function MonthView({ state, selectedDate, onState, pushUndo }: Props) {
  return (
    <div className="period-view">
      <div className="box5 compare-row">
        <PeriodCompare label="This month" date={selectedDate} state={state} />
        <PeriodCompare
          label="Last month"
          date={shiftMonth(selectedDate, -1)}
          state={state}
        />
        <PeriodCompare
          label="Month before"
          date={shiftMonth(selectedDate, -2)}
          state={state}
        />
      </div>
      <ChartBuilder
        state={state}
        selectedDate={selectedDate}
        mode="month"
        onState={onState}
        pushUndo={pushUndo}
      />
    </div>
  );
}
