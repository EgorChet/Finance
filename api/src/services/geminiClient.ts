const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim();
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest";

export type ChatTurn = { role: "user" | "model"; text: string };

export function geminiConfigured(): boolean {
  return !!GEMINI_API_KEY;
}

export function geminiModelName(): string {
  return GEMINI_MODEL;
}

export async function generateGeminiReply(
  systemPrompt: string,
  userMessage: string,
  history: ChatTurn[] = [],
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured on the server");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

  const contents = [
    ...history.map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    })),
    { role: "user", parts: [{ text: userMessage }] },
  ];

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-goog-api-key": GEMINI_API_KEY,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
    }),
  });

  const payload = (await res.json()) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  if (!res.ok) {
    const message = payload.error?.message || `Gemini API error (${res.status})`;
    throw new Error(message);
  }

  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini returned an empty response");
  }

  return text;
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

function extractGeminiChunkText(payload: {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}): string {
  return (
    payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("") || ""
  );
}

export async function* streamGeminiReply(
  systemPrompt: string,
  userMessage: string,
  history: ChatTurn[] = [],
): AsyncGenerator<string, void, unknown> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured on the server");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:streamGenerateContent?alt=sse`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-goog-api-key": GEMINI_API_KEY,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: buildGeminiContents(userMessage, history),
    }),
  });

  if (!res.ok) {
    let message = `Gemini API error (${res.status})`;
    try {
      const payload = (await res.json()) as { error?: { message?: string } };
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

        let payload: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        try {
          payload = JSON.parse(data) as typeof payload;
        } catch {
          continue;
        }

        const chunk = extractGeminiChunkText(payload);
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

  if (!total.trim()) {
    throw new Error("Gemini returned an empty response");
  }
}
