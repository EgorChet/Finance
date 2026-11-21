/** Payslips: personal, so only Egor reads or changes them (Julia gets 403 even on reads). */
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import type { AuthenticatedRequest } from "../auth.js";
import { getPayslipPdf, importPayslipPdf, listPayslips, removePayslip } from "../services/payslips/payslipService.js";

export const payslipsRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

export function ownerOnly(req: Request, res: Response, next: NextFunction): void {
  if ((req as AuthenticatedRequest).userId !== "egor") {
    res.status(403).json({ error: "Payslips are private." });
    return;
  }
  next();
}

payslipsRouter.use(ownerOnly);

payslipsRouter.get("/", async (_req, res) => {
  res.json({ payslips: await listPayslips() });
});

/** Add payslips from a PDF (one month or several pages). Pages that don't add up are refused, not stored. */
payslipsRouter.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  const isPdf = req.file.buffer.subarray(0, 5).toString("latin1") === "%PDF-";
  if (!isPdf) {
    res.status(400).json({ error: "Not a PDF file" });
    return;
  }
  try {
    const result = await importPayslipPdf(req.file.buffer);
    res.status(result.imported.length ? 200 : 422).json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Could not read the PDF" });
  }
});

payslipsRouter.get("/:id/pdf", async (req, res) => {
  const id = String(req.params.id);
  if (!/^\d{4}-\d{2}$/.test(id)) {
    res.status(400).json({ error: "Bad payslip id" });
    return;
  }
  const file = await getPayslipPdf(id);
  if (!file) {
    res.status(404).json({ error: "No original stored for this payslip" });
    return;
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="payslip-${id}.pdf"`);
  res.setHeader("X-Payslip-Page", String(file.page));
  res.setHeader("Cache-Control", "private, no-store");
  res.send(file.bytes);
});

payslipsRouter.delete("/:id", async (req, res) => {
  const id = String(req.params.id);
  if (!/^\d{4}-\d{2}$/.test(id)) {
    res.status(400).json({ error: "Bad payslip id" });
    return;
  }
  res.json({ removed: await removePayslip(id) });
});
