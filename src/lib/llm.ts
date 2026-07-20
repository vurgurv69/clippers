/**
 * Thin LLM wrapper — OpenAI when OPENAI_API_KEY is set, otherwise heuristic fallbacks.
 * Never throws for missing key; callers get `{ usedLlm: false, text }`.
 */

export type LlmResult = {
  text: string;
  usedLlm: boolean;
};

export function hasOpenAiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/**
 * Chat completion with a short timeout. Returns empty string + usedLlm:false on failure.
 */
export async function llmComplete(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<LlmResult> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return { text: "", usedLlm: false };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 900,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn("[llm] OpenAI error", res.status, await res.text().catch(() => ""));
      return { text: "", usedLlm: false };
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    return { text, usedLlm: Boolean(text) };
  } catch (e) {
    console.warn("[llm] request failed", e);
    return { text: "", usedLlm: false };
  } finally {
    clearTimeout(timer);
  }
}

/** Parse JSON from an LLM reply (strips markdown fences). */
export function parseLlmJson<T>(raw: string): T | null {
  if (!raw.trim()) return null;
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
