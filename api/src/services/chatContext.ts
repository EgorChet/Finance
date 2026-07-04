import {
  DEFAULT_PACE_MONTHS,
  getCombinedReportAsync,
  getPaceBundleAsync,
  monthCatalog,
  recentBillingKeys,
} from "./reportService.js";
import { loadFixedCharges } from "./fixedCharges.js";
import { loadLivingBudgetData } from "./livingBudget.js";
import { getFinalizeVersion } from "./finalizeVersion.js";
import { readStatements } from "../storage/index.js";
import type { FixedCharge, LivingBudgetMonthTopup, LivingBudgetSegment, SpendingReport } from "../types.js";

function formatIls(amount: number): string {
  return `₪${Math.round(amount).toLocaleString("en-US")}`;
}

function summarizeReport(report: SpendingReport, label: string): string {
  const lines = [
    `${label}: ${formatIls(report.total_spent)} across ${report.transaction_count} transactions (${report.date_range[0]} – ${report.date_range[1]})`,
  ];
  const topCategories = report.by_category.slice(0, 8);
  if (topCategories.length) {
    lines.push(
      "Categories: " +
        topCategories
          .map((c) => `${c.category_en} ${formatIls(c.total)} (${c.share_pct.toFixed(0)}%)`)
          .join(", "),
    );
  }
  const topMerchants = report.top_merchants.slice(0, 6);
  if (topMerchants.length) {
    lines.push(
      "Top merchants: " +
        topMerchants.map((m) => `${m.merchant_en || m.merchant_he} ${formatIls(m.total)}`).join(", "),
    );
  }
  return lines.join("\n");
}

function summarizeFixedCharges(charges: FixedCharge[]): string {
  const active = charges.filter((c) => c.schedule === "monthly" || c.schedule === "once");
  if (!active.length) return "Fixed charges: none configured.";
  const monthlyTotal = active
    .filter((c) => c.schedule === "monthly")
    .reduce((sum, c) => sum + c.amount, 0);
  const names = active
    .slice(0, 10)
    .map((c) => `${c.name_en} ${formatIls(c.amount)} (${c.schedule || "monthly"})`)
    .join(", ");
  return `Fixed charges: ~${formatIls(monthlyTotal)}/month recurring. Items: ${names}`;
}

function summarizeLivingBudget(segments: LivingBudgetSegment[], topups: LivingBudgetMonthTopup[]): string {
  if (!segments.length && !topups.length) return "Living budget: not configured.";
  const current = segments[segments.length - 1];
  const base = current ? formatIls(current.amount) : "unknown";
  const extras =
    topups.length > 0
      ? topups
          .slice(-3)
          .map((t) => `${t.month} +${formatIls(t.extra)}${t.note ? ` (${t.note})` : ""}`)
          .join(", ")
      : "none";
  return `Living budget base: ${base}/month. Recent top-ups: ${extras}`;
}

export async function buildFinanceContext(): Promise<string> {
  const data = await readStatements();
  const version = await getFinalizeVersion();
  const months = monthCatalog(data).sort((a, b) => b.key.localeCompare(a.key));
  const paceKeys = recentBillingKeys(data, DEFAULT_PACE_MONTHS);
  const { report, scopedReports } = await getPaceBundleAsync(data, paceKeys, version);
  const latestKey = months[0]?.key;
  const latestReport = latestKey ? await getCombinedReportAsync(data, [latestKey], version) : null;

  const sections = [
    "Household finance snapshot (ILS unless noted):",
    months.length
      ? `Available billing cycles: ${months.slice(0, 6).map((m) => `${m.label} (${m.key})`).join(", ")}`
      : "No statements uploaded yet.",
  ];

  if (latestReport) {
    sections.push(summarizeReport(latestReport, `Latest cycle (${months[0]?.label || latestKey})`));
  }
  if (report && paceKeys.length > 1) {
    sections.push(summarizeReport(report, `Pace window (${paceKeys.length} cycles)`));
  }
  if (paceKeys.length > 1) {
    sections.push(
      "Per-cycle totals: " +
        paceKeys
          .map((key) => {
            const scoped = scopedReports[key];
            const label = months.find((m) => m.key === key)?.label || key;
            return scoped ? `${label} ${formatIls(scoped.total_spent)}` : null;
          })
          .filter(Boolean)
          .join(", "),
    );
  }

  sections.push(summarizeFixedCharges(loadFixedCharges()));
  const budget = loadLivingBudgetData();
  sections.push(summarizeLivingBudget(budget.segments, budget.month_topups || []));

  return sections.join("\n\n");
}

export function buildFinanceContextFromBundle(bundle: {
  months: Array<{ key: string; label: string }>;
  report: SpendingReport | null;
  scoped_reports: Record<string, SpendingReport>;
  pace_keys: string[];
  fixed_charges: FixedCharge[];
  living_budget: { segments: LivingBudgetSegment[]; month_topups?: LivingBudgetMonthTopup[] };
  demo_as_of?: string;
}): string {
  const sections = [
    bundle.demo_as_of
      ? `Demo household finance snapshot as of ${bundle.demo_as_of}:`
      : "Household finance snapshot (ILS unless noted):",
    bundle.months.length
      ? `Available billing cycles: ${bundle.months.slice(0, 6).map((m) => `${m.label} (${m.key})`).join(", ")}`
      : "No statements available.",
  ];

  const latest = bundle.months[0];
  const latestReport = latest ? bundle.scoped_reports[latest.key] : null;
  if (latestReport) {
    sections.push(summarizeReport(latestReport, `Latest cycle (${latest.label})`));
  }
  if (bundle.report && bundle.pace_keys.length > 1) {
    sections.push(summarizeReport(bundle.report, `Pace window (${bundle.pace_keys.length} cycles)`));
  }

  sections.push(summarizeFixedCharges(bundle.fixed_charges));
  sections.push(
    summarizeLivingBudget(bundle.living_budget.segments, bundle.living_budget.month_topups || []),
  );

  return sections.join("\n\n");
}
