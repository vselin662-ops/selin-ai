/**
 * ИЗОЛИРОВАННЫЙ АРХИВ ЗАРУБЕЖНЫХ ПРОВАЙДЕРОВ (LEGACY)
 * Этот модуль не используется в активном российском конвейере Selin AI.
 * Хранится исключительно как архив для возможного обращения в будущем.
 */

import { logger } from "../../logger";

export async function legacyCallOpenRouter(messages: any[], apiKey?: string): Promise<string | null> {
  const key = apiKey || process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages,
        temperature: 0.7
      }),
      signal: AbortSignal.timeout(20000)
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch (err: any) {
    logger.warn(`[LegacyOpenRouter] Call failed: ${err?.message}`);
    return null;
  }
}

export async function legacyCallGroq(messages: any[], apiKey?: string): Promise<string | null> {
  const key = apiKey || process.env.GROQ_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages,
        temperature: 0.7
      }),
      signal: AbortSignal.timeout(20000)
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch (err: any) {
    logger.warn(`[LegacyGroq] Call failed: ${err?.message}`);
    return null;
  }
}
