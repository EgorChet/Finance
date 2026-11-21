/** Text and position of every item on every page of a PDF, for the payslip parser. */
import type { PdfTextItem } from "../../../../core/salary/payslipParse.js";

export async function extractPdfPages(bytes: Uint8Array): Promise<PdfTextItem[][]> {
  // The legacy build runs on Node without a canvas; imported lazily so the API starts fast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    isEvalSupported: false,
    verbosity: 0,
  }).promise;
  const pages: PdfTextItem[][] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const height = page.getViewport({ scale: 1 }).height as number;
      const content = await page.getTextContent();
      pages.push(
        (content.items as { str?: string; transform: number[]; width: number }[])
          .filter((i) => typeof i.str === "string" && i.str.trim() !== "")
          .map((i) => ({ str: i.str as string, x0: i.transform[4], x1: i.transform[4] + i.width, y: height - i.transform[5] })),
      );
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}
