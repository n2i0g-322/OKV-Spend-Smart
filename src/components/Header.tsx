import type { ViewName } from '../types';
import {
  formatMonthYear,
  getYear,
  localToday,
  parseLocalDate,
  shiftMonth,
  shiftWeek,
  setYearMonthClamped,
  shiftYear,
  toYMD,
  weekRangeMonSun,
  formatWeekLabel,
} from '../date';

const VIEWS: { id: ViewName; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'bills', label: 'Bills' },
  { id: 'statistics', label: 'Statistics' },
  { id: 'accounts', label: 'Accounts' },
];

interface Props {
  view: ViewName;
  selectedDate: string;
  canUndo: boolean;
  lastSavedAt: string | null;
  lastExportAt: string | null;
  saveError: string | null;
  now: number;
  darkMode: boolean;
  onView: (v: ViewName) => void;
  onDate: (d: string) => void;
  onSearch: () => void;
  onExport: () => void;
  onImport: () => void;
  onUndo: () => void;
  onRules: () => void;
  onToggleDark: () => void;
  onTheme: () => void;
  accounts: { id: string; name: string }[];
  activeAccountId: string;
  onSwitchAccount: (id: string) => void;
}

/** "Saved just now" / "Saved 5 min ago" … for the last successful localStorage write. */
export function savedLabel(iso: string | null, now: number): string {
  if (!iso) return 'Not saved yet';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'Not saved yet';
  const secs = Math.max(0, Math.floor((now - then) / 1000));
  if (secs < 60) return 'Saved just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `Saved ${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Saved ${hrs} h ago`;
  const days = Math.floor(hrs / 24);
  return `Saved ${days} day${days === 1 ? '' : 's'} ago`;
}

export function Header({
  view,
  selectedDate,
  canUndo,
  lastSavedAt,
  lastExportAt,
  saveError,
  now,
  darkMode,
  onView,
  onDate,
  onSearch,
  onExport,
  onImport,
  onUndo,
  onRules,
  onToggleDark,
  onTheme,
  accounts,
  activeAccountId,
  onSwitchAccount,
}: Props) {
  const d = parseLocalDate(selectedDate);
  const week = weekRangeMonSun(selectedDate);
  // Soft export reminder: only once the user has exported before and it is > 14 days old.
  const exportStale =
    !!lastExportAt && now - new Date(lastExportAt).getTime() > 14 * 86400000;

  const goToday = () => onDate(localToday());

  const prev = () => {
    if (view === 'week' || (view === 'bills' && false)) onDate(shiftWeek(selectedDate, -1));
    else if (view === 'month' || view === 'bills') onDate(shiftMonth(selectedDate, -1));
    else if (view === 'year') onDate(shiftYear(selectedDate, -1));
    else onDate(toYMD(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)));
  };

  const next = () => {
    if (view === 'week') onDate(shiftWeek(selectedDate, 1));
    else if (view === 'month' || view === 'bills') onDate(shiftMonth(selectedDate, 1));
    else if (view === 'year') onDate(shiftYear(selectedDate, 1));
    else onDate(toYMD(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)));
  };

  return (
    <header className="app-header">
      <div className="header-top">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            📊
          </span>
          <h1>OKV Spend Smart</h1>
          <label className="account-switch" title="Active account">
            <span className="sr-only">Active account</span>
            <select
              value={activeAccountId}
              aria-label="Active account"
              data-testid="account-switcher"
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__manage') onView('accounts');
                else if (v !== activeAccountId) onSwitchAccount(v);
              }}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
              <option value="__manage">Manage accounts…</option>
            </select>
          </label>
        </div>
        <nav className="view-switcher" aria-label="Views">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className={view === v.id ? 'active' : ''}
              onClick={() => onView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <button type="button" className="btn ghost" onClick={onUndo} disabled={!canUndo}>
            Undo
          </button>
          <button type="button" className="btn ghost" onClick={onRules}>
            Rules
          </button>
          <button type="button" className="btn ghost" onClick={onSearch}>
            Search
          </button>
          <button type="button" className="btn ghost" onClick={onExport}>
            Export
          </button>
          <button type="button" className="btn ghost" onClick={onImport}>
            Import
          </button>
          <button type="button" className="btn ghost" onClick={onTheme}>
            Theme
          </button>
          <label className="theme-switch" title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
            <span className="sr-only">Dark mode</span>
            <input
              type="checkbox"
              checked={darkMode}
              onChange={onToggleDark}
              aria-label="Dark mode"
            />
            <span className="theme-switch-track" aria-hidden>
              <span className="theme-switch-thumb">{darkMode ? '🌙' : '☀️'}</span>
            </span>
          </label>
          <span
            className={`backup-pill${saveError ? ' error' : exportStale ? ' warn' : ''}`}
            title={
              (lastSavedAt ? `Saved in this browser ${new Date(lastSavedAt).toLocaleString('en-CA')}` : '') +
              (lastExportAt ? ` · Last export ${new Date(lastExportAt).toLocaleString('en-CA')}` : ' · Never exported')
            }
            role="status"
            aria-live="polite"
          >
            {saveError ? 'Not saved — storage error' : savedLabel(lastSavedAt, now)}
            {!saveError && exportStale ? ' · export a backup soon' : ''}
          </span>
        </div>
      </div>
      {view !== 'accounts' && (
      <div className="date-nav">
        <button type="button" className="btn ghost" onClick={goToday}>
          Today
        </button>
        <button type="button" className="icon-btn" onClick={prev} aria-label="Previous">
          ‹
        </button>
        {view === 'day' && (
          <>
            <label>
              Year
              <select
                value={getYear(selectedDate)}
                onChange={(e) =>
                  onDate(setYearMonthClamped(selectedDate, Number(e.target.value), d.getMonth()))
                }
              >
                {Array.from({ length: 11 }, (_, i) => getYear(localToday()) - 5 + i).map(
                  (y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              Month
              <select
                value={d.getMonth()}
                onChange={(e) =>
                  onDate(setYearMonthClamped(selectedDate, d.getFullYear(), Number(e.target.value)))
                }
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i}>
                    {new Date(2000, i, 1).toLocaleString('en-CA', { month: 'long' })}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Day
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => onDate(e.target.value)}
              />
            </label>
          </>
        )}
        {view === 'week' && (
          <span className="date-label">
            Week {formatWeekLabel(week.start, week.end)} {getYear(selectedDate)}
          </span>
        )}
        {(view === 'month' || view === 'bills') && (
          <span className="date-label">{formatMonthYear(selectedDate)}</span>
        )}
        {view === 'year' && (
          <span className="date-label">Year {getYear(selectedDate)}</span>
        )}
        {view === 'statistics' && (
          <span className="date-label">All-time facts</span>
        )}
        <button type="button" className="icon-btn" onClick={next} aria-label="Next">
          ›
        </button>
      </div>
      )}
    </header>
  );
}
