// Asks Claude (Anthropic's API) to write text. Server-only; the key lives in ANTHROPIC_API_KEY on Vercel.
export const AI_MODEL = process.env.AI_MODEL || "claude-haiku-4-5-20251001";

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export class AiError extends Error {}

export async function askClaude({ system, prompt, maxTokens = 800 }: { system: string; prompt: string; maxTokens?: number }): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AiError("ANTHROPIC_API_KEY isn't set in Vercel.");
  const response = await fetch(`${process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"}/v1/messages`, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: AI_MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const type = data?.error?.type ?? response.status;
    // Plain-English reasons for the problems people actually hit.
    if (response.status === 401) throw new AiError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in Vercel.");
    if (response.status === 400 && /credit|billing/i.test(JSON.stringify(data))) throw new AiError("The Anthropic account is out of credit. Add credit in the Anthropic console.");
    if (response.status === 429) throw new AiError("Too many AI requests at once. It will try again shortly.");
    throw new AiError(`The AI service returned an error (${type}).`);
  }
  return (data.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("").trim();
}
