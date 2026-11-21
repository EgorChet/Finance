/**
 * Reads a payslip from the text items of its PDF page (text and position), for the template used by
 * the "Trio" payroll software. Pure function: the PDF itself is read elsewhere (api/src/services/payslips).
 *
 * Positions are in PDF points with y counted from the TOP of the page and measured on the text baseline.
 * Hebrew text comes out in logical order; one letter (נ) comes out as "ª" and is put back here.
 *
 * Nothing personal is read: the ID number, bank account and tax file numbers on the page are ignored.
 * Every payslip is checked against its own arithmetic (payments − deductions = net); a mismatch is
 * returned as a warning so a wrong read is never silently stored.
 */
import {
  classifyDeduction,
  classifyLeave,
  classifyPayment,
  type Payslip,
  type PayslipDeduction,
  type PayslipLeave,
  type PayslipPayment,
} from "./payslip.js";

export interface PdfTextItem {
  str: string;
  /** Left and right edge. */
  x0: number;
  x1: number;
  /** Baseline, from the top of the page. */
  y: number;
}

const NUM_RE = /^-?\d[\d,]*(?:\.\d+)?$/;

function toNum(s: string): number | null {
  const t = s.trim();
  if (!NUM_RE.test(t)) return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

const isNum = (i: PdfTextItem) => toNum(i.str) != null;
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const round2 = (x: number) => Math.round(x * 100) / 100;

/** Put the split letters back together ("בו" + "ª" + "וס") and repair the unmapped letter. */
function prepare(raw: PdfTextItem[]): PdfTextItem[] {
  const items = raw
    .map((i) => ({ ...i, str: i.str.replace(/ª/g, "נ") }))
    .filter((i) => i.str.trim() !== "")
    .sort((a, b) => a.y - b.y || b.x1 - a.x1);
  const out: PdfTextItem[] = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    // Same line, touching, read right to left: the new piece sits to the left of the previous one.
    if (prev && near(prev.y, it.y, 1.5) && !isNum(prev) && !isNum(it) && prev.x0 - it.x1 < 1.5 && prev.x0 - it.x1 > -1.5) {
      out[out.length - 1] = { str: prev.str + it.str, x0: it.x0, x1: prev.x1, y: prev.y };
    } else {
      out.push({ ...it });
    }
  }
  return out;
}

/** The numeric item closest in height to `y`; on a tie the one at or below the label wins. */
function closestNum(items: PdfTextItem[], y: number, xMin: number, xMax: number, tol = 6): number | null {
  let best: PdfTextItem | null = null;
  for (const it of items) {
    if (!isNum(it) || it.x1 < xMin || it.x1 > xMax) continue;
    const d = Math.abs(it.y - y);
    if (d > tol) continue;
    if (!best) best = it;
    else {
      const bd = Math.abs(best.y - y);
      if (d < bd - 0.01 || (Math.abs(d - bd) <= 0.01 && it.y >= y && best.y < y)) best = it;
    }
  }
  return best ? toNum(best.str) : null;
}

function isoFromDMY(s: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(s.trim());
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${year}-${m[2]}-${m[1]}`;
}

/**
 * For a label, the value that belongs to it: the nearest numeric item in the column, but never one that
 * is closer to ANOTHER label in the same panel (labels and values of a row are not always on one baseline).
 */
function assign<T extends { y: number }>(labels: T[], items: PdfTextItem[], xMin: number, xMax: number, tol = 6): Map<T, number> {
  const out = new Map<T, number>();
  for (const it of items) {
    if (!isNum(it) || it.x1 < xMin || it.x1 > xMax) continue;
    let best: T | null = null;
    for (const l of labels) {
      const d = Math.abs(it.y - l.y);
      if (d > tol) continue;
      if (!best) best = l;
      else {
        const bd = Math.abs(it.y - best.y);
        if (d < bd - 0.01 || (Math.abs(d - bd) <= 0.01 && l.y <= it.y && best.y > it.y)) best = l;
      }
    }
    if (best && !out.has(best)) out.set(best, toNum(it.str)!);
  }
  return out;
}

export function parsePayslipItems(rawItems: PdfTextItem[]): { payslip: Payslip | null; warnings: string[] } {
  const warnings: string[] = [];
  const items = prepare(rawItems);
  const text = items.filter((i) => !isNum(i));

  // Which month.
  const period = items.find((i) => i.y < 30 && /^\d{1,2}\/\d{2}$/.test(i.str));
  if (!period) return { payslip: null, warnings: ["No payslip title (month/year) found on the page"] };
  const [mm, yy] = period.str.split("/").map(Number);
  const year = 2000 + yy;
  const month = mm;

  const employer = text.find((i) => i.y < 30 && i.x1 > 450)?.str ?? "";

  // Job details.
  const labelOf = (re: RegExp, filter: (i: PdfTextItem) => boolean = () => true) => text.find((i) => re.test(i.str) && filter(i));
  const startLabel = labelOf(/תחילת עבודה/);
  const startDate = startLabel
    ? isoFromDMY(items.find((i) => near(i.y, startLabel.y, 5) && /^\d{2}\/\d{2}\/\d{4}$/.test(i.str) && i.x1 < startLabel.x0)?.str ?? "")
    : null;
  const seniorityLabel = labelOf(/שנות ותק/);
  const seniorityYears = seniorityLabel ? closestNum(items, seniorityLabel.y, 0, 90, 5) : null;
  const pairNear = (label?: PdfTextItem): [number | null, number | null] => {
    if (!label) return [null, null];
    const nums = items.filter((i) => isNum(i) && near(i.y, label.y, 5) && i.x1 < label.x0 + 8).sort((a, b) => b.x1 - a.x1);
    return [nums[0] ? toNum(nums[0].str) : null, nums[1] ? toNum(nums[1].str) : null];
  };
  const [hoursWorked, hoursExpected] = pairNear(labelOf(/^ש' עבודה/));
  const [daysWorked, daysExpected] = pairNear(labelOf(/^ימי עבודה/));
  const scopeLabel = labelOf(/היקף משרה/);
  let scopePercent: number | null = null;
  let hourlyRate: number | null = null;
  if (scopeLabel) {
    const nums = items
      .filter((i) => isNum(i) && i.y > scopeLabel.y && i.y - scopeLabel.y < 10 && i.x1 < scopeLabel.x0 + 5)
      .sort((a, b) => b.x1 - a.x1);
    scopePercent = nums[0] ? toNum(nums[0].str) : null;
    hourlyRate = nums[1] ? toNum(nums[1].str) : null;
  }

  // Payments (right half, between the table header and the deposits block).
  const payments: PayslipPayment[] = [];
  const descRows = new Map<number, PdfTextItem[]>();
  // The page content moves up and down a little from month to month, so blocks are tied to their headings.
  const depositsTitle = text.find((i) => /^הפקדות מעסיק לקופות/.test(i.str));
  const paymentsEnd = (depositsTitle?.y ?? 430) - 3;
  for (const it of text) {
    if (it.x1 < 470 || it.y < 160 || it.y > paymentsEnd || /^תיאור/.test(it.str)) continue;
    const key = [...descRows.keys()].find((k) => near(k, it.y, 1.5)) ?? it.y;
    descRows.set(key, [...(descRows.get(key) ?? []), it]);
  }
  for (const [y, parts] of [...descRows.entries()].sort((a, b) => a[0] - b[0])) {
    const description = parts.sort((a, b) => b.x1 - a.x1).map((p) => p.str).join(" ").trim();
    const col = (lo: number, hi: number) => closestNum(items, y, lo, hi, 3);
    const quantity = col(435, 470);
    const rate = col(395, 432);
    const taxableValue = col(335, 380);
    const amount = col(225, 262);
    payments.push({
      description,
      kind: classifyPayment(description),
      quantity,
      rate,
      taxableValue,
      amount: amount ?? 0,
      benefit: description.startsWith("*"),
    });
  }

  // Deductions (left panel).
  const voluntaryHeader = text.find((i) => /^ניכויי רשות$/.test(i.str) && i.x1 < 180 && i.y > 250 && i.y < paymentsEnd);
  const dedLabels = text.filter(
    (i) =>
      i.x1 >= 100 && i.x1 <= 176 && i.y > 162 && i.y < paymentsEnd &&
      !/^(סכום|ניכויים|ניכויי רשות|סה"כ|שכר|יכויי)/.test(i.str) && !/^\d+$/.test(i.str),
  );
  const dedValues = assign(dedLabels, items, 55, 90, 6);
  const deductions: PayslipDeduction[] = [];
  for (const l of dedLabels.sort((a, b) => a.y - b.y)) {
    const amount = dedValues.get(l);
    if (amount == null) continue;
    deductions.push({
      label: l.str.replace(/\s*שולי%\s*$/, "").trim(),
      kind: classifyDeduction(l.str),
      amount,
      voluntary: !!voluntaryHeader && l.y > voluntaryHeader.y,
    });
  }
  const taxLabel = dedLabels.find((l) => /שולי%/.test(l.str));
  const marginalTaxRate = taxLabel
    ? closestNum(items.filter((i) => i.x1 > 80 && i.x1 < 110), taxLabel.y, 80, 110, 5)
    : null;

  // Totals (left panel, below the tables): one row each, label and value on the same baseline.
  const totals = { gross: 0, mandatoryDeductions: 0, voluntaryDeductions: 0, net: 0, netPayable: 0 };
  const seen = { gross: false, net: false, netPayable: false, mandatory: false };
  const rowsLeft = new Map<number, PdfTextItem[]>();
  const totalsTop = text.find((i) => /^סה"כ תשלומים/.test(i.str) && i.x1 <= 176)?.y ?? 430;
  for (const it of items) {
    if (it.x1 > 176 || it.y < totalsTop - 2 || it.y > totalsTop + 70) continue;
    const key = [...rowsLeft.keys()].find((k) => near(k, it.y, 2)) ?? it.y;
    rowsLeft.set(key, [...(rowsLeft.get(key) ?? []), it]);
  }
  for (const parts of rowsLeft.values()) {
    const label = parts.filter((p) => !isNum(p)).sort((a, b) => b.x1 - a.x1).map((p) => p.str).join(" ");
    const value = parts.find((p) => isNum(p) && p.x1 < 90);
    const v = value ? toNum(value.str) : null;
    if (/ס"ה/.test(label) && /רשות/.test(label)) totals.voluntaryDeductions = v ?? 0;
    else if (/לתשלום/.test(label) && v != null) (totals.netPayable = v), (seen.netPayable = true);
    else if (/חובה/.test(label) && v != null) (totals.mandatoryDeductions = v), (seen.mandatory = true);
    else if (/סה"כ תשלומים/.test(label) && v != null) (totals.gross = v), (seen.gross = true);
    else if (/שכר\s*נטו/.test(label) && v != null) (totals.net = v), (seen.net = true);
  }

  // Tax block: month and year-to-date columns.
  const taxLabels = text.filter((i) => i.x1 >= 535 && i.x1 <= 575 && i.y >= 480 && i.y <= 720);
  const find = (re: RegExp) => taxLabels.find((l) => re.test(l.str));
  const lblBenefit = find(/^שווי למס/);
  const lblTaxable = find(/^חייב מ"ה/);
  const lblInsurance = find(/^חייב ב"ל/);
  const lblCredit = find(/^ערך נ"ז/);
  const lblPensionCredit = find(/^זיכוי גמל/);
  // Month and year-to-date values must come from the label's own row: resolve with the tie-break rule.
  const taxRows = [lblBenefit, lblTaxable, lblInsurance, lblCredit, lblPensionCredit].filter(Boolean) as PdfTextItem[];
  const monthVals = assign(taxRows, items, 465, 505, 6);
  const ytdVals = assign(taxRows, items, 395, 435, 6);

  const cumLabels = text.filter((i) => i.x1 >= 325 && i.x1 <= 352 && i.y >= 480 && i.y <= 720);
  const cumVals = assign(cumLabels, items, 270, 300, 6);
  const cum = (re: RegExp) => {
    const l = cumLabels.find((x) => re.test(x.str));
    return l ? cumVals.get(l) ?? null : null;
  };

  const pointsLabel = text.find((i) => i.x1 >= 325 && i.x1 <= 352 && /^נ"ז$/.test(i.str));
  const creditPoints = pointsLabel ? closestNum(items, pointsLabel.y, 275, 300, 6) : null;
  // "Months worked": the small number under the "חודשי עבודה" heading, 10–30 points below it.
  const monthsLabel = text.find((i) => /^חודשי עבודה/.test(i.str) && i.x1 > 150 && i.x1 < 260);
  const monthsItem = monthsLabel
    ? items.find((i) => isNum(i) && /^\d+$/.test(i.str) && i.x1 >= 70 && i.x1 <= 100 && i.y > monthsLabel.y + 8 && i.y < monthsLabel.y + 40)
    : undefined;
  const monthsInCalculation = monthsItem ? toNum(monthsItem.str) : null;

  // Employer deposits.
  const header = {
    base: text.find((i) => /שכר לגמל/.test(i.str) && i.x1 > 450),
    employer: text.find((i) => /^תגמולים/.test(i.str)),
    severance: text.find((i) => /^פיצויים/.test(i.str) && i.x1 > 400),
  };
  const depositsY = header.base?.y ?? 0;
  const fundLabels = text.filter((i) => i.x1 >= 540 && i.x1 <= 575 && i.y > depositsY + 5 && i.y < depositsY + 45);
  const depositAt = (l: PdfTextItem | undefined, h?: PdfTextItem) =>
    l && h ? closestNum(items.filter((i) => near(i.y, l.y, 2)), l.y, h.x1 - 18, h.x1 + 18, 3) : null;
  const pensionRow = fundLabels.find((l) => classifyDeduction(l.str) === "pension");
  const studyRow = fundLabels.find((l) => classifyDeduction(l.str) === "study_fund");
  const insuredLabel = text.find((i) => /משכורת מבוטחת/.test(i.str));
  const insuredSalary = insuredLabel ? closestNum(items.filter((i) => near(i.y, insuredLabel.y, 2)), insuredLabel.y, 262, 282, 3) : null;

  // Leave balances.
  const leaveLabels = text.filter((i) => i.x1 >= 200 && i.x1 <= 235 && i.y >= 480 && i.y <= 720 && classifyLeave(i.str) !== "other");
  const leaveCols: ["previous" | "added" | "used" | "balance", number, number][] = [
    ["previous", 138, 162],
    ["added", 104, 126],
    ["used", 66, 92],
    ["balance", 36, 58],
  ];
  const leave: PayslipLeave[] = leaveLabels
    .sort((a, b) => a.y - b.y)
    .map((l) => ({ label: l.str, kind: classifyLeave(l.str), previous: null, added: null, used: null, balance: null }));
  leaveCols.forEach(([key, lo, hi]) => {
    const vals = assign(leaveLabels, items, lo, hi, 6);
    leaveLabels.forEach((l) => {
      const row = leave.find((r) => r.label === l.str);
      if (row && vals.has(l)) row[key] = vals.get(l)!;
    });
  });

  const printedAt = isoFromDMY(items.find((i) => i.y > 740 && /^\d{2}\/\d{2}\/\d{2}$/.test(i.str))?.str ?? "");

  const payslip: Payslip = {
    id: `${year}-${String(month).padStart(2, "0")}`,
    year,
    month,
    employer,
    printedAt,
    job: { startDate, seniorityYears, hoursWorked, hoursExpected, daysWorked, daysExpected, scopePercent, hourlyRate },
    payments,
    deductions,
    marginalTaxRate,
    totals,
    tax: {
      taxableMonth: lblTaxable ? monthVals.get(lblTaxable) ?? null : null,
      taxableYtd: lblTaxable ? ytdVals.get(lblTaxable) ?? null : null,
      benefitMonth: lblBenefit ? monthVals.get(lblBenefit) ?? null : null,
      benefitYtd: lblBenefit ? ytdVals.get(lblBenefit) ?? null : null,
      insuranceBaseMonth: lblInsurance ? monthVals.get(lblInsurance) ?? null : null,
      creditPoints,
      creditPointsValueMonth: lblCredit ? monthVals.get(lblCredit) ?? null : null,
      pensionCreditMonth: lblPensionCredit ? monthVals.get(lblPensionCredit) ?? null : null,
      incomeTaxYtd: cum(/^מס הכנסה/),
      nationalInsuranceYtd: cum(/^ביטוח לאומי/),
      healthTaxYtd: cum(/^בריאות/),
      monthsInCalculation,
    },
    deposits: {
      insuredSalary,
      pensionBase: depositAt(pensionRow, header.base),
      pensionEmployer: depositAt(pensionRow, header.employer),
      severance: depositAt(pensionRow, header.severance),
      studyFundBase: depositAt(studyRow, header.base),
      studyFundEmployer: depositAt(studyRow, header.employer),
    },
    leave,
  };

  // The payslip must add up; if it doesn't, something was read wrongly.
  if (!seen.gross || !seen.net || !seen.mandatory) warnings.push("Totals were not all found");
  const paid = round2(payments.reduce((s, p) => s + p.amount, 0));
  if (Math.abs(paid - totals.gross) > 0.02) warnings.push(`Payments add up to ${paid}, the payslip says ${totals.gross}`);
  const mandatory = round2(deductions.filter((d) => !d.voluntary).reduce((s, d) => s + d.amount, 0));
  if (Math.abs(mandatory - totals.mandatoryDeductions) > 0.02) {
    warnings.push(`Deductions add up to ${mandatory}, the payslip says ${totals.mandatoryDeductions}`);
  }
  if (Math.abs(round2(totals.gross - totals.mandatoryDeductions) - totals.net) > 0.02) {
    warnings.push(`Gross − deductions is ${round2(totals.gross - totals.mandatoryDeductions)}, net says ${totals.net}`);
  }
  if (seen.netPayable && Math.abs(round2(totals.net - totals.voluntaryDeductions) - totals.netPayable) > 0.02) {
    warnings.push(`Net − voluntary deductions is ${round2(totals.net - totals.voluntaryDeductions)}, net payable says ${totals.netPayable}`);
  }
  return { payslip, warnings };
}
