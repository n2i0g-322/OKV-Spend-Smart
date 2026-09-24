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
- **Opening view:** Day view for today.

## localStorage

- Key prefix: `okvSpendSmart`
- Primary blob: `okvSpendSmart:state`

**Warning:** Clearing site data / cookies for this origin wipes localStorage and deletes all OKV Spend Smart data. Export backups regularly (JSON + CSV).

Export filenames: `OKV-Spend-Smart-backup.json` / `OKV-Spend-Smart-backup.csv`.

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
