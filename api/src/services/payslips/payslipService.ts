/** Payslips: read the PDF, check each page adds up, keep the data and the original. Owner-only (see the route). */
import { createHash } from "crypto";
import type { Payslip } from "../../../../core/salary/payslip.js";
import { parsePayslipItems, type PdfTextItem } from "../../../../core/salary/payslipParse.js";
import {
  deletePayslipPdf,
  readPayslipPdf,
  readPayslips,
  savePayslipPdf,
  writePayslips,
} from "../../storage/index.js";
import { extractPdfPages } from "./pdfText.js";

export interface ImportResult {
  imported: { id: string; page: number; gross: number; net: number }[];
  /** Pages that were not stored, with why (not a payslip, or the arithmetic didn't add up). */
  rejected: { page: number; id?: string; warnings: string[] }[];
}

/** The PDF's content hash names its file: the same file uploaded twice is kept once. */
export function pdfKeyFor(bytes: Buffer): string {
  return `${createHash("sha256").update(bytes).digest("hex").slice(0, 24)}.pdf`;
}

export async function listPayslips(): Promise<Payslip[]> {
  const data = await readPayslips();
  return Object.values(data.payslips).sort((a, b) => b.id.localeCompare(a.id));
}

/** Store what was read from `pages`. A page whose own arithmetic fails is rejected, never stored. */
export async function importPayslipPages(pages: PdfTextItem[][], pdf: Buffer): Promise<ImportResult> {
  const key = pdfKeyFor(pdf);
  const result: ImportResult = { imported: [], rejected: [] };
  const accepted: Payslip[] = [];
  pages.forEach((items, index) => {
    const page = index + 1;
    const { payslip, warnings } = parsePayslipItems(items);
    if (!payslip) result.rejected.push({ page, warnings });
    else if (warnings.length) result.rejected.push({ page, id: payslip.id, warnings });
    else accepted.push({ ...payslip, pdfPath: key, pdfPage: page });
  });
  if (!accepted.length) return result;

  await savePayslipPdf(key, pdf);
  const data = await readPayslips();
  const replaced = new Set<string>();
  for (const p of accepted) {
    const old = data.payslips[p.id];
    if (old?.pdfPath && old.pdfPath !== key) replaced.add(old.pdfPath);
    data.payslips[p.id] = p;
    result.imported.push({ id: p.id, page: p.pdfPage ?? 1, gross: p.totals.gross, net: p.totals.net });
  }
  await writePayslips(data);
  // A file that no payslip points to any more is dropped.
  const stillUsed = new Set(Object.values(data.payslips).map((p) => p.pdfPath));
  for (const old of replaced) if (!stillUsed.has(old)) await deletePayslipPdf(old);
  return result;
}

export async function importPayslipPdf(pdf: Buffer): Promise<ImportResult> {
  return importPayslipPages(await extractPdfPages(new Uint8Array(pdf)), pdf);
}

export async function getPayslipPdf(id: string): Promise<{ bytes: Buffer; page: number } | null> {
  const data = await readPayslips();
  const p = data.payslips[id];
  if (!p?.pdfPath) return null;
  const bytes = await readPayslipPdf(p.pdfPath);
  return bytes ? { bytes, page: p.pdfPage ?? 1 } : null;
}

export async function removePayslip(id: string): Promise<boolean> {
  const data = await readPayslips();
  const p = data.payslips[id];
  if (!p) return false;
  delete data.payslips[id];
  await writePayslips(data);
  if (p.pdfPath && !Object.values(data.payslips).some((x) => x.pdfPath === p.pdfPath)) await deletePayslipPdf(p.pdfPath);
  return true;
}
