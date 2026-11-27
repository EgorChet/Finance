import type { Payslip } from "./payslip";

/**
 * Checks of the vacation days and their pay across payslips: what was added, what was used, whether the
 * balance carries from month to month, and whether the days paid match the days taken. Pure arithmetic on
 * what the payslips say; it never decides what the employee is owed.
 */

export type CheckKind = "accrual" | "carry" | "balance_math" | "paid_days" | "rate_math" | "salary_math";

export interface CheckFlag {
  kind: CheckKind;
  /** "error": the numbers contradict each other. "warn": unusual, worth asking about. */
  severity: "warn" | "error";
  values: Record<string, number>;
}

export interface VacationRow {
  id: string;
  year: number;
  month: number;
  previous: number | null;
  added: number | null;
  used: number | null;
  balance: number | null;
  /** Vacation days and money actually paid on the payslip. */
  paidDays: number;
  paidAmount: number;
  flags: CheckFlag[];
}

export interface VacationReport {
  rows: VacationRow[];
  flagged: number;
  /** The usual monthly accrual (median of the positive ones). */
  usualAccrual: number | null;
  opening: number | null;
  closing: number | null;
  addedTotal: number;
  usedTotal: number;
  /** Balance that appeared between payslips without being added or used (the sum of "carry" differences). */
  jumpTotal: number;
}

const EPS = 0.011;
const near = (a: number, b: number, tol = EPS) => Math.abs(a - b) <= tol;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const PAID_DAY_KINDS = new Set(["vacation", "holidays", "election_day"]);

/** `lastMonths`: report only the latest N payslips (the carry check still sees the month before them). */
export function checkVacation(payslips: Payslip[], lastMonths?: number): VacationReport {
  const sorted = [...payslips].sort((a, b) => a.id.localeCompare(b.id));
  const usualAccrual = median(
    sorted.flatMap((p) => {
      const a = p.leave.find((l) => l.kind === "vacation")?.added;
      return a != null && a > 0 ? [a] : [];
    }),
  );

  const all: VacationRow[] = [];
  let prevBalance: number | null = null;
  for (const p of sorted) {
    const leave = p.leave.find((l) => l.kind === "vacation");
    const vacationLines = p.payments.filter((x) => x.kind === "vacation");
    const paidDays = vacationLines.reduce((s, x) => s + (x.quantity ?? 0), 0);
    const paidAmount = vacationLines.reduce((s, x) => s + x.amount, 0);
    const flags: CheckFlag[] = [];
    const used = leave?.used ?? 0;

    if (leave) {
      const { previous, added, balance } = leave;
      if (previous != null && added != null && balance != null && !near(previous + added - used, balance)) {
        flags.push({ kind: "balance_math", severity: "error", values: { previous, added, used, balance } });
      }
      if (prevBalance != null && previous != null && !near(previous, prevBalance)) {
        flags.push({ kind: "carry", severity: "warn", values: { previous, lastBalance: prevBalance, difference: previous - prevBalance } });
      }
      if (added != null && usualAccrual != null && added < usualAccrual && used === 0) {
        flags.push({ kind: "accrual", severity: "warn", values: { added, usual: usualAccrual } });
      }
      prevBalance = balance ?? prevBalance;
    }

    if (leave && !near(used, paidDays, 0.01)) {
      flags.push({ kind: "paid_days", severity: "error", values: { used, paid: paidDays } });
    } else if (!leave && paidDays > 0) {
      flags.push({ kind: "paid_days", severity: "error", values: { used: 0, paid: paidDays } });
    }
    for (const line of vacationLines) {
      if (line.quantity != null && line.rate != null && Math.abs(line.quantity * line.rate - line.amount) > 0.05) {
        flags.push({ kind: "rate_math", severity: "error", values: { quantity: line.quantity, rate: line.rate, amount: line.amount } });
      }
    }

    // Base salary plus the paid days should come back to the full monthly pay: days × daily rate.
    const dayLines = p.payments.filter((x) => PAID_DAY_KINDS.has(x.kind) && x.quantity != null && x.rate != null);
    const expectedDays = p.job.daysExpected;
    if (dayLines.length && expectedDays) {
      const base = p.payments.filter((x) => x.kind === "base_salary").reduce((s, x) => s + x.amount, 0);
      const sum = base + dayLines.reduce((s, x) => s + x.amount, 0);
      const expected = dayLines[0].rate! * expectedDays;
      if (Math.abs(sum - expected) > 1) {
        flags.push({ kind: "salary_math", severity: "warn", values: { sum, expected } });
      }
    }

    all.push({
      id: p.id,
      year: p.year,
      month: p.month,
      previous: leave?.previous ?? null,
      added: leave?.added ?? null,
      used: leave?.used ?? null,
      balance: leave?.balance ?? null,
      paidDays,
      paidAmount,
      flags,
    });
  }

  const rows = lastMonths ? all.slice(-lastMonths) : all;
  const withBalance = rows.filter((r) => r.balance != null);
  return {
    rows,
    flagged: rows.filter((r) => r.flags.length).length,
    usualAccrual,
    opening: rows.find((r) => r.previous != null)?.previous ?? null,
    closing: withBalance.length ? withBalance[withBalance.length - 1].balance : null,
    addedTotal: rows.reduce((s, r) => s + (r.added ?? 0), 0),
    usedTotal: rows.reduce((s, r) => s + (r.used ?? 0), 0),
    jumpTotal: rows.reduce((s, r) => s + r.flags.filter((f) => f.kind === "carry").reduce((x, f) => x + f.values.difference, 0), 0),
  };
}
