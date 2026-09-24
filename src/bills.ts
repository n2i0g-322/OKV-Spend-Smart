import type { Bill, BillStatus } from './types';
import { daysInMonth, localToday, parseLocalDate, weekdayMon0 } from './date';

/**
 * Is this bill due on `date`? Recurring bills start at `nextDueDate`
 * (no phantom/overdue occurrences in months before the bill existed).
 */
export function dueOn(bill: Bill, date: string): boolean {
  if (bill.frequency === 'once') return bill.nextDueDate === date;
  if (date < bill.nextDueDate) return false;
  if (bill.frequency === 'monthly') {
    const day = parseLocalDate(date).getDate();
    const anchor = bill.dueDay || parseLocalDate(bill.nextDueDate).getDate();
    return day === Math.min(anchor, daysInMonth(date));
  }
  if (bill.frequency === 'weekly') {
    // Weekday comes from nextDueDate (dueDay was historically stored as a day-of-month).
    return weekdayMon0(date) === weekdayMon0(bill.nextDueDate);
  }
  if (bill.frequency === 'yearly') {
    const d = parseLocalDate(date);
    const n = parseLocalDate(bill.nextDueDate);
    if (d.getMonth() !== n.getMonth()) return false;
    return d.getDate() === Math.min(n.getDate(), daysInMonth(date));
  }
  return false;
}

export function statusFor(bill: Bill, date: string): BillStatus {
  const stored = bill.statusByDate[date];
  if (stored) return stored;
  const today = localToday();
  const due = dueOn(bill, date);
  if (date === today && due) return 'due';
  if (due && date < today) return 'overdue';
  return 'upcoming';
}

export function billsOnDate(bills: Bill[], date: string): Bill[] {
  return bills.filter((b) => dueOn(b, date) || b.statusByDate[date] === 'overdue');
}

/** Bills whose first due date passed without being marked paid/skipped (still open before `asOf`). */
export function openOverdue(bills: Bill[], asOf: string): Bill[] {
  const today = localToday();
  return bills.filter((b) => {
    if (
      b.nextDueDate < asOf &&
      b.nextDueDate < today &&
      !['paid', 'skipped'].includes(b.statusByDate[b.nextDueDate] ?? '')
    ) {
      return true;
    }
    return Object.entries(b.statusByDate).some(
      ([d, s]) => s === 'overdue' && d < asOf,
    );
  });
}
