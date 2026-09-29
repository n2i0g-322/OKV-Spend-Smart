import { useEffect, useRef, useState } from 'react';
import type { AppState, ExpectedFrequency, PayFrequency, PaySchedule } from '../types';
import {
  addDays,
  formatMoney,
  formatShortDate,
  formatWeekLabel,
  isValidYMD,
  localToday,
  weekRangeMonSun,
  monthBounds,
} from '../date';
import {
  calendarAverages,
  expectedForMonth,
  scheduledPaydays,
  typicalWeek,
  filterByRange,
  impliedDaily,
  impliedMonthly,
  impliedWeekly,
  incomeAmount,
  netSaved,
  roundCents,
} from '../money';

interface Props {
  state: AppState;
  selectedDate: string;
  /** Last day of the viewed range (day/week/month/year) — Box 4 span ends here if it is in the past. */
  rangeEnd?: string;
  onAddFunds: () => void;
  onExpectedChange: (frequency: ExpectedFrequency, amount: number) => void;
  onPayScheduleChange?: (ps: PaySchedule | null) => void;
}

const PAY_LABEL: Record<PayFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
};

const shortRange = (a: string, b: string) =>
  `${formatShortDate(a)}${a.slice(0, 4) !== b.slice(0, 4) ? `, ${a.slice(0, 4)}` : ''} – ${formatShortDate(b)}, ${b.slice(0, 4)}`;

export function SummaryCards({
  state,
  selectedDate,
  rangeEnd,
  onAddFunds,
  onExpectedChange,
  onPayScheduleChange,
}: Props) {
  const today = localToday();
  const week = weekRangeMonSun(selectedDate);
  const month = monthBounds(selectedDate);
  const typical = typicalWeek(state.entries, state.paySchedule, selectedDate, today);
  const tw = typical.thisWeek;
  const isCurrentWeek = today >= week.start && today <= week.end;
  const nextPay = state.paySchedule
    ? scheduledPaydays(state.paySchedule, today, addDays(today, 62))[0]
    : undefined;
  const monthNet = netSaved(filterByRange(state.entries, month.start, month.end));
  const monthIncome = incomeAmount(
    filterByRange(state.entries, month.start, month.end),
  );
  const expectedMonth = expectedForMonth(state.expectedIncome, selectedDate);
  const diff = roundCents(monthIncome - expectedMonth);
  const avgs = calendarAverages(state.entries, rangeEnd ?? selectedDate, today);
  const freq = state.expectedIncome.frequency;

  // Local draft so typing "12." or clearing the field doesn't fight the saved number.
  const saved = state.expectedIncome.amount;
  const [draft, setDraft] = useState(saved ? String(saved) : '');
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(saved ? String(saved) : '');
  }, [saved]);

  return (
    <div className="summary-cards">
      <article className="card tint-green" data-testid="box1">
        <div className="card-icon" aria-hidden>
          🐷
        </div>
        <h3>Typical week’s net</h3>
        {typical.hasData ? (
          <>
            <p className="big">{formatMoney(typical.value)}</p>
            <p className="sub">
              {typical.method === 'mean'
                ? `Mean of the last ${typical.weeksUsed.length} completed week${typical.weeksUsed.length === 1 ? '' : 's'} with no payday or income`
                : `Median of ${typical.weeksUsed.length} completed week${typical.weeksUsed.length === 1 ? '' : 's'} (fewer than 2 weeks without payday)`}
            </p>
          </>
        ) : (
          <p className="big muted-big">Not enough data yet.</p>
        )}
        <p className="muted small week-actual" data-testid="week-actual">
          {isCurrentWeek ? 'This week actual' : `Selected week actual ${formatWeekLabel(week.start, week.end)}`}: In{' '}
          {formatMoney(tw.income)} · Out {formatMoney(tw.out)} · Net {formatMoney(tw.net)}
        </p>
        {typical.thisWeekIsPayday && (
          <p className="badge payday-badge" data-testid="payday-badge">
            Payday week — not used in typical.
          </p>
        )}
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
            value={draft}
            placeholder="0.00"
            onFocus={() => {
              focused.current = true;
            }}
            onBlur={() => {
              focused.current = false;
              setDraft(saved ? String(saved) : '');
            }}
            onChange={(e) => {
              setDraft(e.target.value);
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
            {diff === 0 ? 'On plan' : `${diff > 0 ? 'Ahead' : 'Behind'} ${formatMoney(Math.abs(diff))}`}
          </span>
        </p>
        <div className="pay-schedule" data-testid="pay-schedule">
          <label>
            <span className="small">Payday markers</span>{' '}
            <select
              value={state.paySchedule?.frequency ?? ''}
              onChange={(e) => {
                const f = e.target.value as PayFrequency | '';
                if (!onPayScheduleChange) return;
                if (!f) onPayScheduleChange(null);
                else onPayScheduleChange({ ...(state.paySchedule ?? {}), frequency: f, anchor: state.paySchedule?.anchor ?? today });
              }}
            >
              <option value="">None (income dates only)</option>
              {(Object.keys(PAY_LABEL) as PayFrequency[]).map((f) => (
                <option key={f} value={f}>
                  {PAY_LABEL[f]}
                </option>
              ))}
            </select>
          </label>
          {state.paySchedule && (
            <label>
              <span className="small">from</span>{' '}
              <input
                type="date"
                value={state.paySchedule.anchor}
                onChange={(e) => {
                  const d = e.target.value;
                  if (isValidYMD(d) && onPayScheduleChange) onPayScheduleChange({ ...state.paySchedule!, anchor: d });
                }}
              />
            </label>
          )}
          {nextPay && <span className="muted tiny">Next payday marker: {formatShortDate(nextPay)}</span>}
          {state.paySchedule?.amount ? (
            <span className="muted tiny" data-testid="paycheck-plan">
              Paycheck (planning only): {formatMoney(state.paySchedule.amount)}
            </span>
          ) : null}
        </div>
        <p className="muted tiny">Planning only — expected pay and payday markers never enter net saved.</p>
        <button type="button" className="btn primary sm" onClick={onAddFunds}>
          + Add funds received
        </button>
      </article>

      <article className="card tint-red" data-testid="box4">
        <div className="card-icon" aria-hidden>
          🏦
        </div>
        <h3>{avgs.pastRange ? `Saved through ${formatShortDate(avgs.spanEnd)}` : 'Saved so far'}</h3>
        <p className="big">{formatMoney(avgs.allTime)}</p>
        {!avgs.hasData ? (
          <p className="muted">Not enough data yet.</p>
        ) : (
          <>
            <p className="sub">All time · {shortRange(avgs.spanStart, avgs.spanEnd)}</p>
            <ul className="avg-list">
              <li>
                Avg daily <strong>{formatMoney(avgs.avgDaily)}</strong>{' '}
                <span className="muted small">÷ {avgs.calendarDays} calendar day{avgs.calendarDays === 1 ? '' : 's'}</span>
              </li>
              <li>
                Avg weekly <strong>{formatMoney(avgs.avgWeekly)}</strong>{' '}
                <span className="muted small">÷ {avgs.calendarWeeks} Mon–Sun week{avgs.calendarWeeks === 1 ? '' : 's'}</span>
              </li>
              <li>
                Avg monthly <strong>{formatMoney(avgs.avgMonthly)}</strong>{' '}
                <span className="muted small">÷ {avgs.calendarMonths} calendar month{avgs.calendarMonths === 1 ? '' : 's'}</span>
              </li>
            </ul>
            <p className="muted tiny">
              Empty days/weeks count. Old figure: {formatMoney(avgs.perDayWithEntries)} per day with entries (
              {avgs.daysWithData} days).
            </p>
          </>
        )}
      </article>
    </div>
  );
}
