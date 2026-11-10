import { GoogleGenAI } from "@google/genai";
import { env } from "@/lib/env";

/** Minimal interface so the AI can be replaced by a fake in tests. */
export interface LlmClient {
  json<T>(prompt: string, schema: Record<string, unknown>): Promise<T>;
}

export class LlmError extends Error {}

const RETRYABLE = /\b(429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand/i;

/** Gemini client, or null when GEMINI_API_KEY / GEMINI_MODEL are not set. */
export function geminiClient(): LlmClient | null {
  const { GEMINI_API_KEY, GEMINI_MODEL, GEMINI_FALLBACK_MODEL } = env();
  if (!GEMINI_API_KEY || !GEMINI_MODEL) return null;
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const models = [GEMINI_MODEL, GEMINI_FALLBACK_MODEL].filter((m): m is string => !!m);

  return {
    async json<T>(prompt: string, schema: Record<string, unknown>): Promise<T> {
      let lastError: unknown;
      for (const model of models) {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await ai.models.generateContent({
              model,
              contents: prompt,
              config: { responseMimeType: "application/json", responseJsonSchema: schema, temperature: 0 },
            });
            if (!res.text) throw new LlmError("Empty response from Gemini");
            return JSON.parse(res.text) as T;
          } catch (e) {
            lastError = e;
            if (!RETRYABLE.test(String((e as Error)?.message))) break; // not worth retrying this model
            await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
          }
        }
      }
      throw new LlmError(`Gemini request failed: ${String((lastError as Error)?.message ?? lastError).slice(0, 300)}`);
    },
  };
}
