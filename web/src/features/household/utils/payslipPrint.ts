/**
 * A payslip as a printable Russian page with the Hebrew of each line in brackets, so the original can be
 * read side by side. Opened in a new window; the browser's print dialog saves it as PDF.
 * Always in Russian: it is a translation aid for the Hebrew original, not a mirror of the UI language.
 */
import {
  PAYSLIP_HEBREW as HE,
  deductionKindLabel,
  leaveKindLabel,
  paymentHebrew,
  paymentKindLabel,
  type Payslip,
} from "@core/salary/payslip";

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** "₪15,000" or "₪15,000.50": shekels whole unless there are agorot. */
export function money(x: number): string {
  const whole = Math.abs(x - Math.round(x)) < 0.005;
  return "₪" + x.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
}

const he = (s: string) => (s ? ` <span class="he">(<bdi dir="rtl" lang="he">${esc(s)}</bdi>)</span>` : "");

function row(ru: string, hebrew: string, value: string, note = ""): string {
  return `<tr><td>${esc(ru)}${he(hebrew)}${note ? `<div class="note">${esc(note)}</div>` : ""}</td><td class="num">${esc(value)}</td></tr>`;
}

function table(title: string, hebrew: string, rows: string[], head?: string): string {
  if (!rows.length) return "";
  return `<h2>${esc(title)}${he(hebrew)}</h2><table>${head ?? ""}${rows.join("")}</table>`;
}

export function payslipMonthRu(p: Payslip): string {
  const m = MONTHS[p.month - 1] ?? String(p.month);
  return `${m.charAt(0).toUpperCase()}${m.slice(1)} ${p.year}`;
}

export function payslipPrintHtml(p: Payslip): string {
  const d = p.deposits;
  const tx = p.tax;
  const job = p.job;
  const net = p.totals.netPayable || p.totals.net;

  const payments = p.payments.map((x) => {
    const note = x.benefit
      ? `не выплачивается, облагается налогом · ${money(x.taxableValue ?? 0)}`
      : x.quantity && x.rate && x.quantity !== 1
        ? `${x.quantity} × ${money(x.rate)}`
        : "";
    return row(paymentKindLabel(x.kind, "ru"), paymentHebrew(x), x.benefit ? "—" : money(x.amount), note);
  });

  const deductions = p.deductions.map((x) =>
    row(
      deductionKindLabel(x.kind, "ru") + (x.voluntary ? " (добровольный)" : ""),
      x.label,
      "− " + money(x.amount),
      x.kind === "income_tax" && p.marginalTaxRate ? `ступень налога ${p.marginalTaxRate}% (${HE.marginalRate})` : "",
    ),
  );

  const totals = [
    row("Всего начислено", HE.grossTotal, money(p.totals.gross)),
    row("Обязательные вычеты и пенсия", HE.mandatoryDeductions, "− " + money(p.totals.mandatoryDeductions)),
    p.totals.voluntaryDeductions ? row("Добровольные вычеты", HE.voluntaryDeductions, "− " + money(p.totals.voluntaryDeductions)) : "",
    row("Зарплата нетто", HE.net, money(p.totals.net)),
    row("К выплате на руки", HE.netPayable, money(net)),
  ].filter(Boolean);

  const deposits = [
    d.pensionEmployer != null ? row("Работодатель: пенсия", HE.employerContribution, money(d.pensionEmployer), d.pensionBase != null ? `база (${HE.fundBase}) ${money(d.pensionBase)}` : "") : "",
    d.severance != null ? row("Работодатель: выходное пособие (пицуим)", HE.severance, money(d.severance)) : "",
    d.studyFundEmployer != null ? row("Работодатель: керен иштальмут", HE.employerContribution, money(d.studyFundEmployer), d.studyFundBase != null ? `база (${HE.fundBase}) ${money(d.studyFundBase)}` : "") : "",
    d.insuredSalary != null ? row("Застрахованная зарплата", HE.insuredSalary, money(d.insuredSalary)) : "",
  ].filter(Boolean);

  const taxMonthOf = (kind: string) => p.deductions.filter((x) => x.kind === kind).reduce((s, x) => s + x.amount, 0);
  const two = (ru: string, hebrew: string, month: number | null, ytd: number | null) =>
    month == null && ytd == null
      ? ""
      : `<tr><td>${esc(ru)}${he(hebrew)}</td><td class="num">${month == null ? "—" : money(month)}</td><td class="num">${ytd == null ? "—" : money(ytd)}</td></tr>`;
  const taxRows = [
    two("Облагаемый доход", HE.taxable, tx.taxableMonth, tx.taxableYtd),
    two("Облагаемые льготы", HE.benefit, tx.benefitMonth, tx.benefitYtd),
    two("Доход для нацстраха", HE.insuranceBase, tx.insuranceBaseMonth, null),
    two("Стоимость налоговых баллов", HE.creditPointsValue, tx.creditPointsValueMonth, null),
    two("Налоговый зачёт за пенсию", HE.pensionCredit, tx.pensionCreditMonth, null),
    two("Подоходный налог", HE.incomeTax, taxMonthOf("income_tax") || null, tx.incomeTaxYtd),
    two("Национальное страхование", HE.nationalInsurance, taxMonthOf("national_insurance") || null, tx.nationalInsuranceYtd),
    two("Налог на здравоохранение", HE.healthTax, taxMonthOf("health_tax") || null, tx.healthTaxYtd),
  ].filter(Boolean);
  if (tx.creditPoints != null) taxRows.push(`<tr><td>Баллы налогового зачёта${he(HE.creditPoints)}</td><td class="num" colspan="2">${tx.creditPoints}</td></tr>`);
  if (tx.monthsInCalculation != null) taxRows.push(`<tr><td>Месяцев в расчёте${he(HE.monthsInCalculation)}</td><td class="num" colspan="2">${tx.monthsInCalculation}</td></tr>`);
  const taxHead = `<tr class="head"><td></td><td class="num">за месяц</td><td class="num">с начала года</td></tr>`;

  const leave = p.leave.length
    ? `<tr class="head"><td></td><td class="num">было</td><td class="num">начислено</td><td class="num">использовано</td><td class="num">осталось</td></tr>` +
      p.leave
        .map((l) => {
          const c = (v: number | null) => `<td class="num">${v == null ? "—" : v}</td>`;
          return `<tr><td>${esc(leaveKindLabel(l.kind, "ru"))}${he(l.label)}</td>${c(l.previous)}${c(l.added)}${c(l.used)}${c(l.balance)}</tr>`;
        })
        .join("")
    : "";

  const work = [
    job.startDate ? row("Начало работы", HE.startDate, job.startDate.split("-").reverse().join(".")) : "",
    job.seniorityYears != null ? row("Стаж, лет", HE.seniority, String(job.seniorityYears)) : "",
    job.scopePercent != null ? row("Ставка, %", HE.scope, String(job.scopePercent)) : "",
    job.hoursExpected ? row("Часы: отработано / норма", HE.hours, `${job.hoursWorked ?? 0} / ${job.hoursExpected}`) : "",
    job.daysExpected ? row("Дни: отработано / норма", HE.days, `${job.daysWorked ?? 0} / ${job.daysExpected}`) : "",
    job.hourlyRate ? row("Ставка в час", "", money(job.hourlyRate)) : "",
  ].filter(Boolean);

  const title = `Расчётный лист · ${payslipMonthRu(p)}`;
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; font: 13px/1.4 -apple-system, "Segoe UI", Arial, sans-serif; color: #111; background: #fff; }
  main { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 20px; margin: 0; }
  .sub { color: #555; margin: 2px 0 14px; }
  .hero { display: flex; gap: 24px; flex-wrap: wrap; padding: 12px 14px; border: 1px solid #ddd; border-radius: 10px; margin-bottom: 8px; }
  .hero b { display: block; font-size: 18px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #555; margin: 18px 0 4px; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  td { padding: 5px 0; border-bottom: 1px solid #eee; vertical-align: top; }
  td + td { padding-left: 12px; }
  tr.head td { color: #777; font-size: 11px; border-bottom: 1px solid #ccc; }
  .num { text-align: right; white-space: nowrap; }
  .he { color: #666; }
  .note { color: #777; font-size: 11px; }
  .foot { margin-top: 18px; color: #888; font-size: 11px; }
  @media print { body { padding: 0; } @page { margin: 14mm; } h2 { break-after: avoid; } tr { break-inside: avoid; } }
</style></head>
<body><main>
  <h1>${esc(title)}${he(HE.title)}</h1>
  <p class="sub">${p.employer ? `<bdi dir="rtl" lang="he">${esc(p.employer)}</bdi>` : ""}${p.printedAt ? ` · напечатан ${esc(p.printedAt.split("-").reverse().join("."))}` : ""}</p>
  <div class="hero">
    <span>К выплате на руки${he(HE.netPayable)}<b>${money(net)}</b></span>
    <span>Начислено${he(HE.grossTotal)}<b>${money(p.totals.gross)}</b></span>
    <span>Вычеты<b>− ${money(p.totals.mandatoryDeductions + p.totals.voluntaryDeductions)}</b></span>
  </div>
  ${table("Начисления", HE.payments, payments)}
  ${table("Вычеты", HE.deductions, deductions)}
  ${table("Итоги", "", totals)}
  ${table("Работодатель платит в ваши фонды", HE.deposits, deposits)}
  ${taxRows.length ? `<h2>Налоги</h2><table>${taxHead}${taxRows.join("")}</table>` : ""}
  ${leave ? `<h2>Отпуск и больничные</h2><table>${leave}</table>` : ""}
  ${table("Работа", "", work)}
  <p class="foot">Перевод для понимания. Юридическую силу имеет оригинал на иврите.</p>
</main>
<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 200); });</script>
</body></html>`;
}

/** Opens the Russian page in a new window and starts printing it ("Save as PDF" in the print dialog). */
export function openPayslipPrint(p: Payslip): boolean {
  const html = payslipPrintHtml(p);
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const win = window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return !!win;
}
