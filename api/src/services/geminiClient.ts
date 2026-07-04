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
