const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim();
// Prefer a stable non-thinking model. gemini-flash-latest is a moving alias that often
// returns STOP with only thought parts (no visible text) when given a large system prompt.
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash-lite";
const DEFAULT_FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];

const MAX_EMPTY_RETRIES = 2;
const MAX_TRANSIENT_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const EMPTY_RETRY_NUDGE =
  "Please answer the user's question concisely using only the finance snapshot provided above.";

export type ChatTurn = { role: "user" | "model"; text: string };

type GeminiPart = { text?: string; thought?: boolean };
type GeminiCandidate = {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
};
type GeminiPayload = {
  error?: { message?: string };
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
};

/** Compact server logs for Render — never includes prompts, messages, or API keys. */
function logGemini(event: string, fields: Record<string, string | number | boolean | undefined>): void {
  const parts = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${value}`);
  console.info(`[gemini] ${event}${parts.length ? ` ${parts.join(" ")}` : ""}`);
}

function summarizePayload(payload: GeminiPayload): {
  finishReason?: string;
  blockReason?: string;
  parts: number;
  thoughtParts: number;
  visibleChars: number;
} {
  const parts = payload.candidates?.[0]?.content?.parts || [];
  const thoughtParts = parts.filter((part) => part.thought === true).length;
  const visibleChars = extractGeminiText(payload).length;
  return {
    finishReason: payload.candidates?.[0]?.finishReason,
    blockReason: payload.promptFeedback?.blockReason,
    parts: parts.length,
    thoughtParts,
    visibleChars,
  };
}

class GeminiApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GeminiApiError";
    this.status = status;
  }
}

export function geminiConfigured(): boolean {
  return !!GEMINI_API_KEY;
}

export function geminiModelName(): string {
  return GEMINI_MODEL;
}

export function friendlyGeminiError(message: string): string {
  if (
    /high demand|overloaded|try again later|capacity|temporarily unavailable|rate limit|too many requests|resource exhausted/i.test(
      message,
    )
  ) {
    return "The assistant is busy right now. Please wait a moment and try again.";
  }
  return message;
}

function resolveModelChain(): string[] {
  const primary = GEMINI_MODEL;
  const fromEnv = process.env.GEMINI_FALLBACK_MODELS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const fallbacks = fromEnv?.length ? fromEnv : DEFAULT_FALLBACK_MODELS;
  return [primary, ...fallbacks.filter((model) => model !== primary)];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableGeminiError(status: number, message: string): boolean {
  if (status === 429 || status === 503 || status === 500) return true;
  return /high demand|overloaded|resource exhausted|try again later|rate limit|capacity|temporarily unavailable|too many requests/i.test(
    message,
  );
}

function shouldRetryGeminiError(error: unknown): boolean {
  return error instanceof GeminiApiError && isRetryableGeminiError(error.status, error.message);
}

async function throwGeminiApiError(res: Response, model: string, mode: "generate" | "stream"): Promise<never> {
  let message = `Gemini API error (${res.status})`;
  try {
    const payload = (await res.json()) as GeminiPayload;
    if (payload.error?.message) message = payload.error.message;
  } catch {
    /* ignore parse errors */
  }
  logGemini("http_error", {
    mode,
    model,
    status: res.status,
    message: message.slice(0, 200),
  });
  throw new GeminiApiError(message, res.status);
}

function buildGenerationConfig(model: string): Record<string, unknown> {
  const config: Record<string, unknown> = {
    maxOutputTokens: 2048,
    temperature: 0.4,
  };

  // Thinking models can return STOP with no visible text — disable or minimize reasoning for chat.
  if (/gemini-2\.5/i.test(model)) {
    config.thinkingConfig = { thinkingBudget: 0 };
  } else if (/gemini-3|flash-latest/i.test(model)) {
    // flash-latest may ignore unknown fields; send both shapes when possible.
    config.thinkingConfig = { thinkingBudget: 0, thinkingLevel: "minimal" };
  }

  return config;
}

function buildGeminiContents(userMessage: string, history: ChatTurn[]) {
  return [
    ...history.map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    })),
    { role: "user", parts: [{ text: userMessage }] },
  ];
}

function buildGeminiRequestBody(
  model: string,
  systemPrompt: string,
  userMessage: string,
  history: ChatTurn[],
) {
  return {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: buildGeminiContents(userMessage, history),
    generationConfig: buildGenerationConfig(model),
  };
}

function extractGeminiText(payload: GeminiPayload): string {
  return (
    payload.candidates?.[0]?.content?.parts
      ?.filter((part) => part.thought !== true)
      .map((part) => part.text || "")
      .join("")
      .trim() || ""
  );
}

function emptyResponseDetail(payload: GeminiPayload): string {
  const finishReason = payload.candidates?.[0]?.finishReason;
  const blockReason = payload.promptFeedback?.blockReason;
  const details = [
    finishReason ? `finishReason=${finishReason}` : null,
    blockReason ? `blockReason=${blockReason}` : null,
  ].filter(Boolean);
  return details.length ? ` (${details.join(", ")})` : "";
}

function geminiGenerateUrl(model: string, streaming: boolean): string {
  const action = streaming ? "streamGenerateContent?alt=sse" : "generateContent";
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${action}`;
}

async function requestGemini(
  model: string,
  systemPrompt: string,
  userMessage: string,
  history: ChatTurn[],
  streaming: boolean,
): Promise<Response> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured on the server");
  }

  return fetch(geminiGenerateUrl(model, streaming), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-goog-api-key": GEMINI_API_KEY,
    },
    body: JSON.stringify(buildGeminiRequestBody(model, systemPrompt, userMessage, history)),
  });
}

async function generateGeminiReplyOnce(
  model: string,
  systemPrompt: string,
  userMessage: string,
  history: ChatTurn[] = [],
): Promise<{ text: string; detail: string }> {
  const started = Date.now();
  const res = await requestGemini(model, systemPrompt, userMessage, history, false);
  if (!res.ok) await throwGeminiApiError(res, model, "generate");

  const payload = (await res.json()) as GeminiPayload;
  const summary = summarizePayload(payload);
  const text = extractGeminiText(payload);
  const detail = emptyResponseDetail(payload);

  if (text) {
    logGemini("ok", {
      mode: "generate",
      model,
      ms: Date.now() - started,
      chars: text.length,
      finishReason: summary.finishReason,
    });
  } else {
    logGemini("empty", {
      mode: "generate",
      model,
      ms: Date.now() - started,
      finishReason: summary.finishReason,
      blockReason: summary.blockReason,
      parts: summary.parts,
      thoughtParts: summary.thoughtParts,
    });
  }

  return { text, detail };
}

/** Try each model until one returns visible text (empty is not success). */
async function generateWithVisibleText(
  systemPrompt: string,
  userMessage: string,
  history: ChatTurn[],
): Promise<{ text: string; detail: string }> {
  let lastDetail = "";

  for (const model of resolveModelChain()) {
    let delay = INITIAL_RETRY_DELAY_MS;
    for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
      try {
        logGemini("attempt", {
          mode: "generate",
          model,
          attempt: attempt + 1,
          maxAttempts: MAX_TRANSIENT_RETRIES + 1,
        });
        const result = await generateGeminiReplyOnce(model, systemPrompt, userMessage, history);
        if (result.text) return result;
        lastDetail = result.detail;
        logGemini("fallback_model", { mode: "generate", model, reason: "empty" });
        break; // empty — try next model, not another transient retry
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = error instanceof GeminiApiError ? error.status : undefined;
        if (!shouldRetryGeminiError(error)) {
          logGemini("fail", { mode: "generate", model, status, message: message.slice(0, 200) });
          throw error;
        }
        if (attempt < MAX_TRANSIENT_RETRIES) {
          logGemini("retry", {
            mode: "generate",
            model,
            attempt: attempt + 1,
            delayMs: delay,
            status,
            message: message.slice(0, 200),
          });
          await sleep(delay);
          delay *= 2;
          continue;
        }
        logGemini("fallback_model", {
          mode: "generate",
          model,
          reason: "transient_exhausted",
          status,
          message: message.slice(0, 200),
        });
      }
    }
  }

  return { text: "", detail: lastDetail };
}

export async function generateGeminiReply(
  systemPrompt: string,
  userMessage: string,
  history: ChatTurn[] = [],
): Promise<string> {
  let message = userMessage;
  let lastDetail = "";

  logGemini("start", {
    mode: "generate",
    models: resolveModelChain().join(","),
    historyTurns: history.length,
    messageChars: userMessage.length,
    systemChars: systemPrompt.length,
  });

  for (let attempt = 0; attempt <= MAX_EMPTY_RETRIES; attempt++) {
    const { text, detail } = await generateWithVisibleText(systemPrompt, message, history);
    if (text) return text;

    lastDetail = detail;
    if (attempt < MAX_EMPTY_RETRIES) {
      logGemini("empty_retry", { mode: "generate", attempt: attempt + 1, detail: detail.trim() });
      message = `${userMessage}\n\n(${EMPTY_RETRY_NUDGE})`;
    }
  }

  logGemini("fail", { mode: "generate", reason: "empty", detail: lastDetail.trim() });
  throw new Error(`Gemini returned an empty response${lastDetail}`);
}

function parseGeminiStreamPayload(data: string): GeminiPayload[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return [];
  }

  if (Array.isArray(parsed)) {
    return parsed.filter((item): item is GeminiPayload => !!item && typeof item === "object");
  }
  if (parsed && typeof parsed === "object") {
    return [parsed as GeminiPayload];
  }
  return [];
}

async function* streamGeminiReplyOnce(
  model: string,
  systemPrompt: string,
  userMessage: string,
  history: ChatTurn[] = [],
): AsyncGenerator<string, { detail: string }, unknown> {
  const started = Date.now();
  const res = await requestGemini(model, systemPrompt, userMessage, history, true);
  if (!res.ok) await throwGeminiApiError(res, model, "stream");

  const reader = res.body?.getReader();
  if (!reader) {
    logGemini("empty", { mode: "stream", model, reason: "no_body" });
    throw new Error("Gemini returned an empty stream");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let total = "";
  let lastPayload: GeminiPayload = {};
  let eventsSeen = 0;

  const processEvent = function* (event: string): Generator<string> {
    for (const line of event.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (!data || data === "[DONE]") continue;

      for (const payload of parseGeminiStreamPayload(data)) {
        eventsSeen += 1;
        lastPayload = payload;
        const chunk = extractGeminiText(payload);
        if (!chunk) continue;

        // Gemini may send cumulative text in some models — emit only the delta.
        let delta = chunk;
        if (chunk.startsWith(total)) {
          delta = chunk.slice(total.length);
          total = chunk;
        } else {
          total += chunk;
        }

        if (delta) yield delta;
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      if (buffer.trim()) {
        for (const chunk of processEvent(buffer)) yield chunk;
      }
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const event of events) {
      for (const chunk of processEvent(event)) yield chunk;
    }
  }

  const summary = summarizePayload(lastPayload);
  const detail = emptyResponseDetail(lastPayload);
  if (total.trim()) {
    logGemini("ok", {
      mode: "stream",
      model,
      ms: Date.now() - started,
      chars: total.length,
      events: eventsSeen,
      finishReason: summary.finishReason,
    });
  } else {
    logGemini("empty", {
      mode: "stream",
      model,
      ms: Date.now() - started,
      events: eventsSeen,
      finishReason: summary.finishReason,
      blockReason: summary.blockReason,
      parts: summary.parts,
      thoughtParts: summary.thoughtParts,
    });
  }

  return { detail };
}

async function* streamWithVisibleText(
  systemPrompt: string,
  userMessage: string,
  history: ChatTurn[],
): AsyncGenerator<string, { detail: string }, unknown> {
  let lastError: unknown;
  let lastDetail = "";

  for (const model of resolveModelChain()) {
    let delay = INITIAL_RETRY_DELAY_MS;
    for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
      try {
        logGemini("attempt", {
          mode: "stream",
          model,
          attempt: attempt + 1,
          maxAttempts: MAX_TRANSIENT_RETRIES + 1,
        });
        const stream = streamGeminiReplyOnce(model, systemPrompt, userMessage, history);
        let total = "";
        while (true) {
          const next = await stream.next();
          if (next.done) {
            lastDetail = next.value?.detail || lastDetail;
            if (total.trim()) return next.value ?? { detail: lastDetail };
            logGemini("fallback_model", { mode: "stream", model, reason: "empty" });
            break; // empty — try next model
          }
          total += next.value;
          yield next.value;
        }
        break; // empty stream finished without throw — next model
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        const status = error instanceof GeminiApiError ? error.status : undefined;
        if (!shouldRetryGeminiError(error)) {
          logGemini("fail", { mode: "stream", model, status, message: message.slice(0, 200) });
          throw error;
        }
        if (attempt < MAX_TRANSIENT_RETRIES) {
          logGemini("retry", {
            mode: "stream",
            model,
            attempt: attempt + 1,
            delayMs: delay,
            status,
            message: message.slice(0, 200),
          });
          await sleep(delay);
          delay *= 2;
        } else {
          logGemini("fallback_model", {
            mode: "stream",
            model,
            reason: "transient_exhausted",
            status,
            message: message.slice(0, 200),
          });
        }
      }
    }
  }

  if (lastDetail) return { detail: lastDetail };
  if (lastError instanceof Error) throw lastError;
  return { detail: "" };
}

export async function* streamGeminiReply(
  systemPrompt: string,
  userMessage: string,
  history: ChatTurn[] = [],
): AsyncGenerator<string, void, unknown> {
  let message = userMessage;
  let lastDetail = "";

  logGemini("start", {
    mode: "stream",
    models: resolveModelChain().join(","),
    historyTurns: history.length,
    messageChars: userMessage.length,
    systemChars: systemPrompt.length,
  });

  for (let attempt = 0; attempt <= MAX_EMPTY_RETRIES; attempt++) {
    const stream = streamWithVisibleText(systemPrompt, message, history);
    let total = "";

    while (true) {
      const next = await stream.next();
      if (next.done) {
        lastDetail = next.value?.detail || "";
        break;
      }
      total += next.value;
      yield next.value;
    }

    if (total.trim()) return;

    if (attempt < MAX_EMPTY_RETRIES) {
      logGemini("empty_retry", { mode: "stream", attempt: attempt + 1, detail: lastDetail.trim() });
      message = `${userMessage}\n\n(${EMPTY_RETRY_NUDGE})`;
    }
  }

  logGemini("fail", { mode: "stream", reason: "empty", detail: lastDetail.trim() });
  throw new Error(`Gemini returned an empty response${lastDetail}`);
}
