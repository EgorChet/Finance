import { generateGeminiReply, geminiConfigured, type ChatTurn } from "./geminiClient.js";
import { buildFinanceContext, buildFinanceContextFromBundle } from "./chatContext.js";
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

export function chatAvailable(): boolean {
  return geminiConfigured();
}

export async function replyToFinanceChat(message: string, history: ClientChatTurn[] = []): Promise<string> {
  if (!geminiConfigured()) {
    throw new Error("Chat is not configured — set GEMINI_API_KEY on the API server");
  }

  const trimmed = message.trim();
  if (!trimmed) {
    throw new Error("message required");
  }
  if (trimmed.length > 4000) {
    throw new Error("message too long (max 4000 characters)");
  }

  const context = await buildFinanceContext();
  const systemPrompt = `${SYSTEM_PROMPT}\n\n---\nFinance snapshot:\n${context}`;

  return generateGeminiReply(systemPrompt, trimmed, trimHistory(history));
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
  if (!geminiConfigured()) {
    throw new Error("Chat is not configured — set GEMINI_API_KEY on the API server");
  }

  const trimmed = message.trim();
  if (!trimmed) {
    throw new Error("message required");
  }

  const context = buildFinanceContextFromBundle(bundle);
  const systemPrompt = `${SYSTEM_PROMPT}\n\n---\nFinance snapshot:\n${context}`;

  return generateGeminiReply(systemPrompt, trimmed, trimHistory(history));
}
