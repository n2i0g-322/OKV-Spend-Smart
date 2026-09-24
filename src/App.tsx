import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppState,
  Column,
  Entry,
  ExpectedFrequency,
  Tab,
  ViewName,
} from './types';
import { isValidYMD, localToday, weekRangeMonSun } from './date';
import {
  KEY as STORAGE_KEY,
  downloadBlob,
  exportCSV,
  exportJSON,
  loadAll,
  markExport,
  mergeStates,
  parseBlob,
  parseImport,
  parseImportTheme,
  saveAll,
  type UiPrefs,
} from './storage';
import { dueOn } from './bills';
import { ensureExtraFundsColumn, getOrCreateUncategorizedColumn, getUncategorizedTab } from './seed';
import { applyRuleDestination, applyRulesToUncategorized, findMatchingRule } from './rules';
import { UndoStack } from './undo';
import { Header } from './components/Header';
import { SummaryCards } from './components/SummaryCards';
import { DayView } from './components/DayView';
import { WeekView } from './components/WeekView';
import { MonthView } from './components/MonthView';
import { YearView } from './components/YearView';
import { BillsView, type BillsSub } from './components/BillsView';
import { StatisticsView } from './components/StatisticsView';
import { AddFunds } from './components/AddFunds';
import { DeleteConfirm } from './components/DeleteConfirm';
import { SplitModal } from './components/Split';
import { SearchModal } from './components/Search';
import { RulesModal } from './components/Rules';
import { FirstOpen } from './components/FirstOpen';
import { Modal } from './components/Modal';
import { ThemePanel } from './components/ThemePanel';
import {
  applyTheme,
  applyPreset,
  resetTheme,
  toggleMode,
  updateColors,
  type ThemeColors,
  type ThemeState,
} from './theme';
import './App.css';

type Toast = { id: string; message: string; undo?: () => void };

/** True when this page load is a browser refresh / back-forward (restore last view + date). */
function isReloadNavigation(): boolean {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;
    return nav?.type === 'reload' || nav?.type === 'back_forward';
  } catch {
    return false;
  }
}

const FLUSH_MS = 60_000;

export default function App() {
  // ---- Boot: READ storage first (synchronously, before first render). ----
  const [boot] = useState(() => {
    const r = loadAll();
    applyTheme(r.theme);
    const restoreUi = r.source === 'blob' && isReloadNavigation();
    const ui: UiPrefs = restoreUi ? r.ui : { view: 'day', selectedDate: localToday() };
    return { ...r, ui };
  });
  const [state, setState] = useState<AppState>(boot.state);
  const [view, setViewState] = useState<ViewName>(boot.ui.view);
  const [selectedDate, setSelectedDateState] = useState(boot.ui.selectedDate);
  const [billsSub, setBillsSub] = useState<BillsSub>('month');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(
    boot.savedAt ?? boot.state.lastBackupAt,
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [highlightEntryId, setHighlightEntryId] = useState<string | null>(null);
  const [addFundsOpen, setAddFundsOpen] = useState(false);
  const [addFundsDate, setAddFundsDate] = useState(localToday());
  const [searchOpen, setSearchOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [splitEntry, setSplitEntry] = useState<Entry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: 'tab'; tab: Tab }
    | { kind: 'column'; col: Column }
    | null
  >(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const undoRef = useRef(new UndoStack());
  const importRef = useRef<HTMLInputElement>(null);
  const [theme, setThemeState] = useState<ThemeState>(boot.theme);
  const [themeOpen, setThemeOpen] = useState(false);

  // ---- Persistence: one blob, written synchronously after every committed action. ----
  /** Latest committed values (refs so a write never uses a stale render's state). */
  const live = useRef<{ state: AppState; theme: ThemeState; ui: UiPrefs }>({
    state: boot.state,
    theme: boot.theme,
    ui: boot.ui,
  });
  /** Never write until hydration from localStorage has finished. */
  const hydrated = useRef(false);
  const dirty = useRef(false);

  const persist = useCallback(() => {
    dirty.current = true;
    if (!hydrated.current) return;
    try {
      const at = saveAll(live.current.state, live.current.theme, live.current.ui);
      dirty.current = false;
      setLastSavedAt(at);
      setNow(Date.now());
      setSaveError(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save');
    }
  }, []);

  useEffect(() => {
    // Hydration finished (state came from storage in the useState initializer).
    hydrated.current = true;
    // Migrate legacy keys into the single blob, or persist a brand-new seed once
    // (only reached when storage was truly empty). Safe under StrictMode double-run.
    if (boot.source !== 'blob' || dirty.current) persist();

    const flush = () => {
      if (dirty.current) persist();
    };
    const tick = window.setInterval(() => {
      flush();
      setNow(Date.now());
    }, FLUSH_MS);
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    // Another browser tab saved: adopt its data so this tab never overwrites it with stale state.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      const other = parseBlob(e.newValue);
      if (!other) return;
      live.current = { ...live.current, state: other.state, theme: other.theme };
      setState(other.state);
      setThemeState(other.theme);
      applyTheme(other.theme);
      setLastSavedAt(other.savedAt);
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    window.addEventListener('storage', onStorage);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('storage', onStorage);
    };
  }, [boot.source, persist]);

  /** Commit a new AppState: update refs, write storage synchronously, then render. */
  const update = useCallback(
    (next: AppState) => {
      const n = ensureExtraFundsColumn(next);
      live.current = { ...live.current, state: n };
      setState(n);
      persist();
    },
    [persist],
  );

  const setTheme = useCallback(
    (t: ThemeState) => {
      live.current = { ...live.current, theme: t };
      setThemeState(t);
      persist();
    },
    [persist],
  );

  const setView = useCallback(
    (v: ViewName) => {
      live.current = { ...live.current, ui: { ...live.current.ui, view: v } };
      setViewState(v);
      persist();
    },
    [persist],
  );

  const setSelectedDate = useCallback(
    (d: string) => {
      if (!isValidYMD(d)) return; // ignore cleared/invalid date inputs
      live.current = { ...live.current, ui: { ...live.current.ui, selectedDate: d } };
      setSelectedDateState(d);
      persist();
    },
    [persist],
  );

  const pushUndo = useCallback(() => {
    undoRef.current.push(state);
    setCanUndo(true);
  }, [state]);

  const showToast = (message: string, undo?: () => void) => {
    const id = crypto.randomUUID();
    setToast({ id, message, undo });
    window.setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 4000);
  };

  const handleUndo = () => {
    const prev = undoRef.current.undo(state);
    if (prev) {
      update(prev);
      setCanUndo(undoRef.current.canUndo());
    }
  };

  const openAddFunds = (date?: string) => {
    let d = date ?? selectedDate;
    if (view === 'week') {
      const w = weekRangeMonSun(selectedDate);
      const today = localToday();
      d = date ?? (today >= w.start && today <= w.end ? today : w.start);
    }
    setAddFundsDate(d);
    setAddFundsOpen(true);
  };

  const confirmAddFunds = (amount: number, date: string, memo: string) => {
    if (!isValidYMD(date) || !(amount > 0)) return;
    pushUndo();
    let s = ensureExtraFundsColumn(state);
    const rule = findMatchingRule(s.rules, memo, 'income');
    const dest = applyRuleDestination(s, rule, 'income');
    s = dest.state;
    const entry: Entry = {
      id: crypto.randomUUID(),
      date,
      tabId: dest.tabId,
      columnId: dest.columnId,
      amount,
      type: 'income',
      memo,
      source: 'add-funds',
    };
    update({ ...s, entries: [...s.entries, entry] });
    setAddFundsOpen(false);
    if (dest.ruled && dest.label) {
      showToast(`Filed under ${dest.label}`);
    }
  };

  const handleQuickAdd = (amount: number, memo: string, date: string) => {
    if (!isValidYMD(date) || !(amount > 0)) return;
    pushUndo();
    let s = state;
    const rule = findMatchingRule(s.rules, memo, 'expense');
    const dest = applyRuleDestination(s, rule, 'expense');
    s = dest.state;
    const entry: Entry = {
      id: crypto.randomUUID(),
      date,
      tabId: dest.tabId,
      columnId: dest.columnId,
      amount,
      type: 'expense',
      memo,
      source: 'quick-add',
    };
    update({ ...s, entries: [...s.entries, entry] });
    if (dest.ruled && dest.label) {
      showToast(`Filed under ${dest.label}`);
    } else if (!rule) {
      const unc = getUncategorizedTab(s);
      if (dest.tabId === unc.id) {
        showToast('Added to Uncategorized — assign a tab in Day view or Rules.');
      }
    }
  };

  const doDelete = (alsoDeleteHistory: boolean) => {
    if (!deleteTarget) return;
    pushUndo();
    const unc = getUncategorizedTab(state);
    const { state: s0, columnId: uncCol } = getOrCreateUncategorizedColumn(state);
    let s = s0;

    if (deleteTarget.kind === 'tab') {
      const tab = deleteTarget.tab;
      if (tab.isSystem) {
        setDeleteTarget(null);
        return;
      }
      const colIds = new Set(s.columns.filter((c) => c.tabId === tab.id).map((c) => c.id));
      if (alsoDeleteHistory) {
        s = {
          ...s,
          entries: s.entries.filter((e) => e.tabId !== tab.id),
          columns: s.columns.filter((c) => c.tabId !== tab.id),
          tabs: s.tabs.filter((t) => t.id !== tab.id),
        };
      } else {
        s = {
          ...s,
          entries: s.entries.map((e) =>
            e.tabId === tab.id ? { ...e, tabId: unc.id, columnId: uncCol } : e,
          ),
          columns: s.columns.filter((c) => c.tabId !== tab.id),
          tabs: s.tabs.filter((t) => t.id !== tab.id),
          rules: s.rules.map((r) =>
            r.destinationTabId === tab.id || colIds.has(r.destinationColumnId)
              ? { ...r, enabled: false }
              : r,
          ),
        };
      }
      if (s.activeTabId === tab.id) s = { ...s, activeTabId: s.tabs[0]?.id ?? null };
    } else {
      const col = deleteTarget.col;
      if (alsoDeleteHistory) {
        s = {
          ...s,
          entries: s.entries.filter((e) => e.columnId !== col.id),
          columns: s.columns.filter((c) => c.id !== col.id),
        };
      } else {
        s = {
          ...s,
          entries: s.entries.map((e) =>
            e.columnId === col.id ? { ...e, tabId: unc.id, columnId: uncCol } : e,
          ),
          columns: s.columns.filter((c) => c.id !== col.id),
          rules: s.rules.map((r) =>
            r.destinationColumnId === col.id ? { ...r, enabled: false } : r,
          ),
        };
      }
    }
    update(s);
    setDeleteTarget(null);
  };

  const doSplit = (lines: { columnId: string; amount: number; memo: string }[]) => {
    if (!splitEntry) return;
    pushUndo();
    const rest = state.entries.filter((e) => e.id !== splitEntry.id);
    const newEntries: Entry[] = lines.map((l) => {
      const col = state.columns.find((c) => c.id === l.columnId)!;
      return {
        id: crypto.randomUUID(),
        date: splitEntry.date,
        tabId: col.tabId,
        columnId: l.columnId,
        amount: l.amount,
        // keep the original type (a split refund stays a refund, income stays income)
        type: splitEntry.type,
        memo: l.memo,
        source: 'split',
      };
    });
    update({ ...state, entries: [...rest, ...newEntries] });
    setSplitEntry(null);
  };

  const dueToday = useMemo(
    () => state.bills.filter((b) => dueOn(b, selectedDate)),
    [state.bills, selectedDate],
  );

  const doExport = (kind: 'json' | 'csv') => {
    const stamped = markExport(state);
    update(stamped);
    if (kind === 'json') {
      downloadBlob(
        'OKV-Spend-Smart-backup.json',
        exportJSON(stamped, theme),
        'application/json',
      );
    } else {
      downloadBlob('OKV-Spend-Smart-backup.csv', exportCSV(stamped), 'text/csv');
    }
    setExportOpen(false);
  };

  const doImport = (mode: 'replace' | 'merge', file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result ?? '');
      const parsed = parseImport(raw);
      if (!parsed) {
        alert('Invalid backup file.');
        return;
      }
      pushUndo();
      if (mode === 'replace') {
        update(parsed);
        const importedTheme = parseImportTheme(raw);
        if (importedTheme) {
          applyTheme(importedTheme);
          setTheme(importedTheme);
        }
      } else update(mergeStates(state, parsed));
      setImportOpen(false);
    };
    reader.readAsText(file);
  };

  return (
    <div className="app">
      <Header
        view={view}
        selectedDate={selectedDate}
        canUndo={canUndo}
        lastSavedAt={lastSavedAt}
        lastExportAt={state.lastExportAt ?? null}
        saveError={saveError}
        now={now}
        darkMode={theme.mode === 'dark'}
        onView={setView}
        onDate={setSelectedDate}
        onSearch={() => setSearchOpen(true)}
        onExport={() => setExportOpen(true)}
        onImport={() => setImportOpen(true)}
        onUndo={handleUndo}
        onRules={() => setRulesOpen(true)}
        onToggleDark={() => setTheme(toggleMode(theme))}
        onTheme={() => setThemeOpen(true)}
      />

      {view !== 'bills' && view !== 'statistics' && (
        <SummaryCards
          state={state}
          selectedDate={selectedDate}
          box1Label={
            view === 'week'
              ? "Selected week's money saved"
              : view === 'year'
                ? "This week's money saved"
                : undefined
          }
          onAddFunds={() => openAddFunds()}
          onExpectedChange={(frequency: ExpectedFrequency, amount: number) => {
            // expected income is planning only — no undo needed for every keystroke, but keep light
            const amt = Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0;
            update({ ...state, expectedIncome: { frequency, amount: amt } });
          }}
        />
      )}

      {view === 'day' && (
        <DayView
          state={state}
          selectedDate={selectedDate}
          highlightEntryId={highlightEntryId}
          dueTodayCount={dueToday.length}
          dueTodayLabel={dueToday.map((b) => b.name).join(', ') || 'bills'}
          onState={update}
          onQuickAdd={handleQuickAdd}
          onOpenBillsDay={() => {
            setBillsSub('day');
            setView('bills');
          }}
          onSplit={setSplitEntry}
          onRequestDeleteTab={(tab) => setDeleteTarget({ kind: 'tab', tab })}
          onRequestDeleteColumn={(col) => setDeleteTarget({ kind: 'column', col })}
          pushUndo={pushUndo}
        />
      )}
      {view === 'week' && (
        <WeekView
          state={state}
          selectedDate={selectedDate}
          onState={update}
          pushUndo={pushUndo}
        />
      )}
      {view === 'month' && (
        <MonthView
          state={state}
          selectedDate={selectedDate}
          onState={update}
          pushUndo={pushUndo}
        />
      )}
      {view === 'year' && (
        <YearView
          state={state}
          selectedDate={selectedDate}
          onState={update}
          pushUndo={pushUndo}
        />
      )}
      {view === 'bills' && (
        <BillsView
          state={state}
          selectedDate={selectedDate}
          sub={billsSub}
          onSub={setBillsSub}
          onState={update}
          onDate={setSelectedDate}
          onAddFunds={(d) => openAddFunds(d)}
          onOpenDayEntry={(date, entryId) => {
            setSelectedDate(date);
            if (entryId) {
              const e = state.entries.find((x) => x.id === entryId);
              if (e) update({ ...state, activeTabId: e.tabId });
              setHighlightEntryId(entryId);
              window.setTimeout(() => setHighlightEntryId(null), 3000);
            }
            setView('day');
          }}
          onToast={(m) => showToast(m)}
          pushUndo={pushUndo}
        />
      )}
      {view === 'statistics' && (
        <StatisticsView state={state} selectedDate={selectedDate} />
      )}

      {addFundsOpen && (
        <AddFunds
          defaultAmount={state.expectedIncome.amount}
          expectedFrequency={state.expectedIncome.frequency}
          defaultDate={addFundsDate}
          onConfirm={confirmAddFunds}
          onClose={() => setAddFundsOpen(false)}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm
          name={
            deleteTarget.kind === 'tab' ? deleteTarget.tab.name : deleteTarget.col.name
          }
          onConfirm={doDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
      {splitEntry && (
        <SplitModal
          entry={splitEntry}
          tabs={state.tabs}
          columns={state.columns}
          onConfirm={doSplit}
          onClose={() => setSplitEntry(null)}
        />
      )}
      {searchOpen && (
        <SearchModal
          state={state}
          onClose={() => setSearchOpen(false)}
          onJump={(date, entryId) => {
            setSelectedDate(date);
            const hit = state.entries.find((x) => x.id === entryId);
            if (hit && hit.tabId !== state.activeTabId) update({ ...state, activeTabId: hit.tabId });
            setHighlightEntryId(entryId);
            setView('day');
            setSearchOpen(false);
            window.setTimeout(() => setHighlightEntryId(null), 3000);
          }}
        />
      )}
      {rulesOpen && (
        <RulesModal
          state={state}
          onClose={() => setRulesOpen(false)}
          onChange={(rules) => {
            pushUndo();
            update({ ...state, rules });
          }}
          onApplyPast={() => {
            pushUndo();
            const { state: next, count } = applyRulesToUncategorized(state);
            update(next);
            showToast(`Applied rules to ${count} Uncategorized entr${count === 1 ? 'y' : 'ies'}.`);
          }}
        />
      )}
      {exportOpen && (
        <Modal title="Export backup" onClose={() => setExportOpen(false)}>
          <p className="muted small">
            Downloads OKV-Spend-Smart-backup.json / .csv. Your data is already saved in this
            browser automatically; an export is a copy you keep elsewhere.
          </p>
          <p className="small">
            Last export:{' '}
            {state.lastExportAt ? new Date(state.lastExportAt).toLocaleString('en-CA') : 'never'}
          </p>
          <div className="modal-actions">
            <button type="button" className="btn primary" onClick={() => doExport('json')}>
              Export JSON
            </button>
            <button type="button" className="btn ghost" onClick={() => doExport('csv')}>
              Export CSV
            </button>
          </div>
        </Modal>
      )}
      {importOpen && (
        <Modal title="Import backup" onClose={() => setImportOpen(false)}>
          <p>Choose a previously exported OKV Spend Smart JSON backup.</p>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const mode = (e.target as HTMLInputElement).dataset.mode as
                | 'replace'
                | 'merge';
              doImport(mode, file);
            }}
          />
          <div className="modal-actions">
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                if (!confirm('Replace all current data with the imported file?')) return;
                if (importRef.current) {
                  importRef.current.dataset.mode = 'replace';
                  importRef.current.click();
                }
              }}
            >
              Replace
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                if (importRef.current) {
                  importRef.current.dataset.mode = 'merge';
                  importRef.current.click();
                }
              }}
            >
              Merge
            </button>
          </div>
        </Modal>
      )}
      {themeOpen && (
        <ThemePanel
          theme={theme}
          onApplyPreset={(id: string) => setTheme(applyPreset(id))}
          onUpdateColor={(key: keyof ThemeColors, value: string) =>
            setTheme(updateColors(theme, { [key]: value }))
          }
          onReset={() => setTheme(resetTheme())}
          onClose={() => setThemeOpen(false)}
        />
      )}
      {!state.hasSeenWelcome && (
        <FirstOpen
          onClose={() => update({ ...state, hasSeenWelcome: true })}
        />
      )}
      {toast && (
        <div className="toast">
          <span>{toast.message}</span>
          {toast.undo && (
            <button type="button" onClick={toast.undo}>
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
