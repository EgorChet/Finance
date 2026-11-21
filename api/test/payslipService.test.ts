/** Importing payslips into local storage: strict about arithmetic, one file per upload, owner-only route. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Local file storage in a temp folder (set before the modules read their environment).
process.env.STORAGE = "local";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "payslips-"));

const { importPayslipPages, listPayslips, getPayslipPdf, removePayslip, pdfKeyFor } = await import("../src/services/payslips/payslipService.js");
const { ownerOnly } = await import("../src/routes/payslips.js");

type Item = { str: string; x0: number; x1: number; y: number };
const it = (x1: number, y: number, str: string): Item => ({ str, x0: x1 - str.length * 5, x1, y });

/** A tiny but complete invented payslip page (same template geometry). */
function page(period: string, gross: string, net: string): Item[] {
  return [
    it(316, 16, "תלוש משכורת"), it(226, 16, period), it(565, 20, "חברת דוגמה בע\"מ"),
    it(539, 156, "תיאור תשלום"), it(563, 168, "שכר יסוד"), it(415, 168, gross), it(246, 168, gross),
    it(165, 172, "מס הכנסה שולי%"), it(94, 172, "20"), it(72, 172, "1,000.00"),
    it(165, 220, "מגדל פנסיה"), it(71, 220, "500.00"),
    it(520, 424, "הפקדות מעסיק לקופות גמל"),
    it(162, 432, 'סה"כ תשלומים'), it(72, 432, gross),
    it(156, 444, "יכויי חובה וגמל"), it(70, 444, "1,500.00"),
    it(161, 456, "שכר"), it(140, 456, "נ"), it(135, 456, "טו"), it(72, 456, net),
    it(160, 480, "נ"), it(156, 480, "טו לתשלום"), it(72, 480, net),
  ];
}

test("good pages are stored with the original; a page that doesn't add up is refused", async () => {
  const pdf = Buffer.from("%PDF-1.4 fake original");
  const result = await importPayslipPages(
    [page("01/27", "10,000.00", "8,500.00"), page("02/27", "10,000.00", "9,999.00"), [it(10, 10, "cover page")]],
    pdf,
  );
  assert.deepEqual(result.imported.map((x) => [x.id, x.page, x.gross, x.net]), [["2027-01", 1, 10000, 8500]]);
  assert.deepEqual(result.rejected.map((x) => [x.page, x.id ?? null]), [[2, "2027-02"], [3, null]]);

  const list = await listPayslips();
  assert.equal(list.length, 1);
  assert.equal(list[0].pdfPath, pdfKeyFor(pdf));
  assert.equal(list[0].pdfPage, 1);
  const file = await getPayslipPdf("2027-01");
  assert.equal(file?.bytes.toString(), "%PDF-1.4 fake original");
  assert.equal(file?.page, 1);
});

test("a newer upload for the same month replaces it, and the file nobody uses is dropped", async () => {
  const pdf2 = Buffer.from("%PDF-1.4 second");
  await importPayslipPages([page("01/27", "11,000.00", "9,500.00")], pdf2);
  const list = await listPayslips();
  assert.equal(list.length, 1);
  assert.equal(list[0].totals.net, 9500);
  assert.equal((await getPayslipPdf("2027-01"))?.bytes.toString(), "%PDF-1.4 second");
  assert.equal(await removePayslip("2027-01"), true);
  assert.equal((await listPayslips()).length, 0);
  assert.equal(await getPayslipPdf("2027-01"), null);
});

test("only Egor gets through the payslips route", () => {
  const run = (userId?: string) => {
    let status = 0;
    let nexted = false;
    const res = { status: (c: number) => ((status = c), { json: () => undefined }) };
    ownerOnly({ userId } as never, res as never, () => (nexted = true));
    return { status, nexted };
  };
  assert.deepEqual(run("egor"), { status: 0, nexted: true });
  assert.deepEqual(run("julia"), { status: 403, nexted: false });
  assert.deepEqual(run(undefined), { status: 403, nexted: false });
});
