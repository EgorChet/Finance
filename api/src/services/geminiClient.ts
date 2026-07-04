const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim();
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash-lite";

const MAX_EMPTY_RETRIES = 2;
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

export function geminiConfigured(): boolean {
  return !!GEMINI_API_KEY;
}

export function geminiModelName(): string {
  return GEMINI_MODEL;
}

function buildGenerationConfig(model: string): Record<string, unknown> {
  const config: Record<string, unknown> = {
    maxOutputTokens: 2048,
    temperature: 0.4,
  };

  // Thinking models can return STOP with no visible text; keep reasoning minimal for chat.
  if (/gemini-2\.5-(flash|flash-lite)/i.test(model)) {
    config.thinkingConfig = { thinkingBudget: 0 };
  } else if (/gemini-3|flash-latest/i.test(model)) {
    config.thinkingConfig = { thinkingLevel: "minimal" };
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

function buildGeminiRequestBody(systemPrompt: string, userMessage: string, history: ChatTurn[]) {
  return {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: buildGeminiContents(userMessage, history),
    generationConfig: buildGenerationConfig(GEMINI_MODEL),
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

function geminiGenerateUrl(streaming: boolean): string {
  const action = streaming ? "streamGenerateContent?alt=sse" : "generateContent";
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:${action}`;
}

async function requestGemini(
  systemPrompt: string,
  userMessage: string,
  history: ChatTurn[],
  streaming: boolean,
): Promise<Response> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured on the server");
  }

  return fetch(geminiGenerateUrl(streaming), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-goog-api-key": GEMINI_API_KEY,
    },
    body: JSON.stringify(buildGeminiRequestBody(systemPrompt, userMessage, history)),
  });
}

async function generateGeminiReplyOnce(
  systemPrompt: string,
  userMessage: string,
  history: ChatTurn[] = [],
): Promise<{ text: string; detail: string }> {
  const res = await requestGemini(systemPrompt, userMessage, history, false);
  const payload = (await res.json()) as GeminiPayload;

  if (!res.ok) {
    const message = payload.error?.message || `Gemini API error (${res.status})`;
    throw new Error(message);
  }

  return { text: extractGeminiText(payload), detail: emptyResponseDetail(payload) };
}

export async function generateGeminiReply(
  systemPrompt: string,
  userMessage: string,
  history: ChatTurn[] = [],
): Promise<string> {
  let message = userMessage;
  let lastDetail = "";

  for (let attempt = 0; attempt <= MAX_EMPTY_RETRIES; attempt++) {
    const { text, detail } = await generateGeminiReplyOnce(systemPrompt, message, history);
    if (text) return text;

    lastDetail = detail;
    if (attempt < MAX_EMPTY_RETRIES) {
      message = `${userMessage}\n\n(${EMPTY_RETRY_NUDGE})`;
    }
  }

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
  systemPrompt: string,
  userMessage: string,
  history: ChatTurn[] = [],
): AsyncGenerator<string, { detail: string }, unknown> {
  const res = await requestGemini(systemPrompt, userMessage, history, true);

  if (!res.ok) {
    let message = `Gemini API error (${res.status})`;
    try {
      const payload = (await res.json()) as GeminiPayload;
      if (payload.error?.message) message = payload.error.message;
    } catch {
      /* ignore parse errors */
    }
    throw new Error(message);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("Gemini returned an empty stream");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let total = "";
  let lastPayload: GeminiPayload = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const event of events) {
      for (const line of event.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;

        for (const payload of parseGeminiStreamPayload(data)) {
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
    }
  }

  return { detail: emptyResponseDetail(lastPayload) };
}

export async function* streamGeminiReply(
  systemPrompt: string,
  userMessage: string,
  history: ChatTurn[] = [],
): AsyncGenerator<string, void, unknown> {
  let message = userMessage;
  let lastDetail = "";

  for (let attempt = 0; attempt <= MAX_EMPTY_RETRIES; attempt++) {
    const stream = streamGeminiReplyOnce(systemPrompt, message, history);
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
      message = `${userMessage}\n\n(${EMPTY_RETRY_NUDGE})`;
    }
  }

  throw new Error(`Gemini returned an empty response${lastDetail}`);
}
