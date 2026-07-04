import { generateGeminiReply, geminiConfigured, streamGeminiReply, type ChatTurn } from "./geminiClient.js";
import { buildFinanceContext, buildFinanceContextFromBundle } from "./chatContext.js";
import type { Response } from "express";
import type { FixedCharge, LivingBudgetMonthTopup, LivingBudgetSegment, SpendingReport } from "../types.js";

export type ClientChatTurn = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT = `You are a helpful household finance assistant for a personal spending tracker app.
Answer using only the finance snapshot provided below. Amounts are in Israeli shekels (₪) unless stated otherwise.
Be concise and practical. If the data does not contain enough information, say what is missing instead of guessing.
Do not invent transactions, merchants, or totals. Do not give investment or tax advice — stick to describing the user's data and simple budgeting insights.`;

function trimHistory(history: ClientChatTurn[]): ChatTurn[] {
  return history
    .slice(-10)
    .filter((turn) => turn.content.trim())
    .map((turn) => ({
      role: turn.role === "assistant" ? "model" : "user",
      text: turn.content.trim(),
    }));
}

function validateChatMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) {
    throw new Error("message required");
  }
  if (trimmed.length > 4000) {
    throw new Error("message too long (max 4000 characters)");
  }
  return trimmed;
}

function assertChatConfigured(): void {
  if (!geminiConfigured()) {
    throw new Error("Chat is not configured — set GEMINI_API_KEY on the API server");
  }
}

function chatErrorStatus(message: string): number {
  return /required|too long/i.test(message) ? 400 : 502;
}

function beginChatStream(res: Response): void {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
}

function writeChatStreamEvent(res: Response, payload: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function pipeGeminiStream(
  res: Response,
  systemPrompt: string,
  message: string,
  history: ClientChatTurn[],
): Promise<void> {
  beginChatStream(res);
  try {
    for await (const chunk of streamGeminiReply(systemPrompt, message, trimHistory(history))) {
      writeChatStreamEvent(res, { text: chunk });
    }
    writeChatStreamEvent(res, { done: true });
    res.end();
  } catch (e) {
    const messageText = e instanceof Error ? e.message : "Chat failed";
    writeChatStreamEvent(res, { error: messageText });
    res.end();
  }
}

export function chatAvailable(): boolean {
  return geminiConfigured();
}

export async function replyToFinanceChat(message: string, history: ClientChatTurn[] = []): Promise<string> {
  assertChatConfigured();
  const trimmed = validateChatMessage(message);
  const context = await buildFinanceContext();
  const systemPrompt = `${SYSTEM_PROMPT}\n\n---\nFinance snapshot:\n${context}`;
  return generateGeminiReply(systemPrompt, trimmed, trimHistory(history));
}

export async function streamFinanceChat(
  res: Response,
  message: string,
  history: ClientChatTurn[] = [],
): Promise<void> {
  assertChatConfigured();
  const trimmed = validateChatMessage(message);
  const context = await buildFinanceContext();
  const systemPrompt = `${SYSTEM_PROMPT}\n\n---\nFinance snapshot:\n${context}`;
  await pipeGeminiStream(res, systemPrompt, trimmed, history);
}

export async function replyToDemoFinanceChat(
  message: string,
  history: ClientChatTurn[] = [],
  bundle: {
    months: Array<{ key: string; label: string }>;
    report: SpendingReport | null;
    scoped_reports: Record<string, SpendingReport>;
    pace_keys: string[];
    fixed_charges: FixedCharge[];
    living_budget: { segments: LivingBudgetSegment[]; month_topups?: LivingBudgetMonthTopup[] };
    demo_as_of?: string;
  },
): Promise<string> {
  assertChatConfigured();
  const trimmed = validateChatMessage(message);

  const context = buildFinanceContextFromBundle(bundle);
  const systemPrompt = `${SYSTEM_PROMPT}\n\n---\nFinance snapshot:\n${context}`;

  return generateGeminiReply(systemPrompt, trimmed, trimHistory(history));
}

export async function streamDemoFinanceChat(
  res: Response,
  message: string,
  history: ClientChatTurn[] = [],
  bundle: {
    months: Array<{ key: string; label: string }>;
    report: SpendingReport | null;
    scoped_reports: Record<string, SpendingReport>;
    pace_keys: string[];
    fixed_charges: FixedCharge[];
    living_budget: { segments: LivingBudgetSegment[]; month_topups?: LivingBudgetMonthTopup[] };
    demo_as_of?: string;
  },
): Promise<void> {
  assertChatConfigured();
  const trimmed = validateChatMessage(message);
  const context = buildFinanceContextFromBundle(bundle);
  const systemPrompt = `${SYSTEM_PROMPT}\n\n---\nFinance snapshot:\n${context}`;
  await pipeGeminiStream(res, systemPrompt, trimmed, history);
}

export { chatErrorStatus };

export function parseChatRequest(body: unknown): { message: string; history: ClientChatTurn[] } {
  const payload = body as {
    message?: string;
    history?: Array<{ role?: string; content?: string }>;
  };
  const history = Array.isArray(payload.history)
    ? payload.history
        .filter((turn) => turn?.role === "user" || turn?.role === "assistant")
        .map((turn) => ({
          role: turn.role as "user" | "assistant",
          content: String(turn.content || ""),
        }))
    : [];
  return { message: String(payload.message || ""), history };
}
