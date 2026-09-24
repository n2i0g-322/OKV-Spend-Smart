import type { AppState, ExpectedFrequency } from '../types';
import {
  formatMoney,
  formatWeekLabel,
  weekRangeMonSun,
  monthBounds,
} from '../date';
import {
  averages,
  expectedForMonth,
  filterByRange,
  impliedDaily,
  impliedMonthly,
  impliedWeekly,
  incomeAmount,
  netSaved,
} from '../money';

interface Props {
  state: AppState;
  selectedDate: string;
  box1Label?: string;
  onAddFunds: () => void;
  onExpectedChange: (frequency: ExpectedFrequency, amount: number) => void;
}

export function SummaryCards({
  state,
  selectedDate,
  box1Label,
  onAddFunds,
  onExpectedChange,
}: Props) {
  const week = weekRangeMonSun(selectedDate);
  const month = monthBounds(selectedDate);
  const weekNet = netSaved(filterByRange(state.entries, week.start, week.end));
  const monthNet = netSaved(filterByRange(state.entries, month.start, month.end));
  const monthIncome = incomeAmount(
    filterByRange(state.entries, month.start, month.end),
  );
  const expectedMonth = expectedForMonth(state.expectedIncome, selectedDate);
  const diff = monthIncome - expectedMonth;
  const avgs = averages(state.entries);
  const freq = state.expectedIncome.frequency;

  return (
    <div className="summary-cards">
      <article className="card tint-green">
        <div className="card-icon" aria-hidden>
          🐷
        </div>
        <h3>{box1Label ?? "This week's money saved"}</h3>
        <p className="big">{formatMoney(weekNet)}</p>
        <p className="sub">{formatWeekLabel(week.start, week.end)}</p>
        <button type="button" className="linkish" onClick={onAddFunds}>
          + Add funds
        </button>
      </article>

      <article className="card tint-purple">
        <div className="card-icon" aria-hidden>
          📈
        </div>
        <h3>Monthly savings</h3>
        <p className="big">{formatMoney(monthNet)}</p>
        <p className="sub">Calendar month of selected day</p>
      </article>

      <article className="card tint-blue">
        <div className="card-icon" aria-hidden>
          💵
        </div>
        <h3>Expected income</h3>
        <div className="freq-tabs">
          {(['daily', 'monthly', 'yearly'] as ExpectedFrequency[]).map((f) => (
            <button
              key={f}
              type="button"
              className={freq === f ? 'active' : ''}
              onClick={() => onExpectedChange(f, state.expectedIncome.amount)}
            >
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <label className="amount-edit">
          <span className="sr-only">Expected amount</span>
          <span className="prefix">$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={state.expectedIncome.amount || ''}
            placeholder="0.00"
            onChange={(e) => {
              const n = Number(e.target.value);
              onExpectedChange(freq, Number.isFinite(n) ? Math.max(0, n) : 0);
            }}
          />
        </label>
        <p className="sub">
          ≈ day {formatMoney(impliedDaily(state.expectedIncome, selectedDate))} · week{' '}
          {formatMoney(impliedWeekly(state.expectedIncome, selectedDate))} · month{' '}
          {formatMoney(impliedMonthly(state.expectedIncome, selectedDate))}
        </p>
        <p className="compare">
          Expected {formatMoney(expectedMonth)} · Received {formatMoney(monthIncome)} ·{' '}
          <span className={diff >= 0 ? 'ahead' : 'behind'}>
            {diff >= 0 ? 'Ahead' : 'Behind'} {formatMoney(Math.abs(diff))}
          </span>
        </p>
        <p className="muted tiny">Planning only — never enters net saved.</p>
        <button type="button" className="btn primary sm" onClick={onAddFunds}>
          + Add funds received
        </button>
      </article>

      <article className="card tint-red">
        <div className="card-icon" aria-hidden>
          🏦
        </div>
        <h3>Saved so far</h3>
        <p className="big">{formatMoney(avgs.allTime)}</p>
        <p className="sub">All time</p>
        {avgs.daysWithData === 0 ? (
          <p className="muted">$0.00 — No data yet.</p>
        ) : (
          <ul className="avg-list">
            <li>
              Avg monthly <strong>{formatMoney(avgs.avgMonthly)}</strong>
            </li>
            <li>
              Avg weekly <strong>{formatMoney(avgs.avgWeekly)}</strong>
            </li>
            <li>
              Avg daily <strong>{formatMoney(avgs.avgDaily)}</strong>
            </li>
          </ul>
        )}
        <p className="muted tiny">Averages use days/weeks/months with data.</p>
      </article>
    </div>
  );
}
