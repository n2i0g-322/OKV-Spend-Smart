import type { ViewName } from '../types';
import {
  formatMonthYear,
  getYear,
  localToday,
  parseLocalDate,
  shiftMonth,
  shiftWeek,
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
];

interface Props {
  view: ViewName;
  selectedDate: string;
  canUndo: boolean;
  lastBackupAt: string | null;
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
}

function backupLabel(iso: string | null): string {
  if (!iso) return 'Never backed up';
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return 'Last backup today';
  if (days === 1) return 'Last backup 1 day ago';
  return `Last backup ${days} days ago`;
}

export function Header({
  view,
  selectedDate,
  canUndo,
  lastBackupAt,
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
}: Props) {
  const d = parseLocalDate(selectedDate);
  const week = weekRangeMonSun(selectedDate);
  const stale =
    !lastBackupAt ||
    Date.now() - new Date(lastBackupAt).getTime() > 14 * 86400000;

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
          <span className={`backup-pill${stale ? ' warn' : ''}`}>
            {backupLabel(lastBackupAt)}
            {stale && lastBackupAt ? ' — backup soon' : ''}
          </span>
        </div>
      </div>
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
                onChange={(e) => {
                  const nd = new Date(d);
                  nd.setFullYear(Number(e.target.value));
                  onDate(toYMD(nd));
                }}
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
                onChange={(e) => {
                  const nd = new Date(d);
                  nd.setMonth(Number(e.target.value));
                  onDate(toYMD(nd));
                }}
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
    </header>
  );
}
