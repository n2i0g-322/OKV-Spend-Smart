# OKV Spend Smart

Personal finance single-page app. No backend. All data stays in your browser.

## Quick start

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

GitHub Pages base path is `/OKV-Spend-Smart/`.

## Product rules

- **Currency:** CAD, `$` prefix, 2 decimal places.
- **Weeks:** Monday–Sunday.
- **Dates:** Local calendar `YYYY-MM-DD`. Never derive “today” via `toISOString().slice(0,10)` (avoids Alberta evening UTC shift).
- **Opening view:** Day view for today. A browser refresh restores the view/date you were on.

## localStorage

- One blob under the key **`okvSpendSmart`** (schema 4):
  `{ schema: 4, version: 4, savedAt, activeAccountId, accounts: [{ id, name, createdAt, savedAt, setupDone, data, ui }], theme }`.
  Each account's `data` is a full, separate dataset: tabs, columns (+ soft budgets), entries, bills
  (+ occurrences and action log), rules, charts, Box 3 expected income + payday schedule, `lastBackupAt`
  (= last successful save) and `lastExportAt`; `ui` is that account's last view + selected date.
  `theme` (the colour theme) is shared by all accounts.
- Older single-account blobs (schema ≤3) and the old `okvSpendSmart:state` key migrate into “Account 1”
  unchanged. A verbatim copy is kept once under `okvSpendSmart:pre-schema4-backup` (and
  `okvSpendSmart:pre-schema3-backup` for schema ≤2).
- Reset keeps a copy under `okvSpendSmart:reset-backup-<accountId>-<timestamp>`, and Delete keeps one under
  `okvSpendSmart:deleted-backup-<accountId>-<timestamp>`.
- Written synchronously after every committed action, plus a 60-second flush if anything is dirty.
  The header shows “Saved just now / Saved N min ago”.
- On boot storage is read first; default tabs are seeded only when storage is truly empty. Nothing is
  written until that read has finished.
- Older builds used `okvSpendSmart:state` and `okvSpendSmart:theme`. These are read as a fallback,
  merged into the new blob automatically, and left in place untouched.
- If the app is open in two browser tabs, a save in one tab is picked up by the other.

**Warning:** Clearing site data / cookies for this origin wipes localStorage and deletes all OKV Spend Smart data. Export backups regularly (JSON + CSV).

Export filenames: `OKV-Spend-Smart-backup.json` / `OKV-Spend-Smart-backup.csv` (active account), and
`OKV-Spend-Smart-backup-all-accounts.json` (every account). A single-account backup, including one from
an older version, imports into the active account after a confirm. An all-accounts file is added as new accounts.

## Accounts and setup wizard

- The **Accounts** tab (after Statistics) lists every account. Each one has Switch, Rename, Reset and Delete,
  plus Create account and Run setup wizard. The header has a quick account switcher.
- **Create** makes an empty “Account N”, switches to it and opens the setup wizard.
- **Reset** clears one account back to the defaults (the name is kept) after one confirm, then opens the wizard.
- **Delete** asks 3 confirmations, then a random addition question, then you type `DELETE`. The last account
  can't be deleted; use Reset instead.
- The **setup wizard** has 4 steps: welcome + name, paycheck (amount + Daily / Weekly / Every 2 weeks / Monthly +
  payday), bills, summary. It is planning only: it sets payday markers + Box 3 and creates bill reminders.
  It never creates entries. It opens automatically only for an account with no entries, no bills and no
  `setupDone` flag. Finishing, skipping or closing it sets `setupDone`.

## Data model

- **Tabs** — categories (Bills, Food, …, Income, system Uncategorized).
- **Columns** — sub-items under a tab (e.g. Food → Groceries).
- **Entries** — every actual dollar: `{ id, date, tabId, columnId, amount, type: income|expense|refund, memo, source }`.
- **Bills** — schedule items (due dates, payee, status). Not entries.
- **Rules** — memo match → tab/column.
- **Expected income** — Box 3 frequency + amount.

### Expected income vs actual

Expected income (Daily / Monthly / Yearly amount) is **planning only**. It never enters net saved, day/week/month/year totals, averages, charts, or Statistics. Only **Add funds received** (or Income grid lines) create income entries.

### Payday markers vs income

Payday chips mark dates implied by expected frequency (and dates that already have income). Clicking shows a note and a shortcut to Add funds. **Nothing is saved until Confirm.**

### Bills overview calendar

The Bills month view is a full activity board: payday markers (green, marker only), scheduled
bill reminders (🔔, bill colour), and every real entry for the day (tab colour, name, amount;
“+N more” when busy). Click an empty part of a day for: **Add bill** (reminder only),
**Add funds received** (income after Confirm), or **Add {tab}** for every tab (creates a real
entry with `source: "bills-overview"`). Click a chip to open that day’s detail focused on it.

### Bill status vs logged payment

Marking a bill **Paid** is a checklist status only. It does **not** create an expense. After Paid, an optional prompt (default **No**) can also record an expense under Bills.

### Net saved

`income − expenses + refunds` (refunds reduce spend; they are not income).

### Averages

All-time net ÷ count of months / weeks / days that contain ≥1 entry. Denominator 0 → `$0.00` and “No data yet.”

## Sample walkthrough

1. Set expected monthly income to `$3200` (Box 3) — Boxes 1–4 nets unchanged.
2. Add funds `$3200` on a date — income entry created; nets update.
3. Add a grocery expense — expenses/net update.
4. Create rent bill due the 1st; mark **Paid** without logging — no money movement.
5. Log rent on the 3rd as an expense — Boxes 1–4 move only then.

## Stack

Vite + React + TypeScript, Chart.js / react-chartjs-2.
