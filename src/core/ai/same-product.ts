import type { Identity } from "@/core/identity/match";
import type { LlmClient } from "./gemini";

export interface AiSameProduct {
  verdict: "yes" | "no" | "unsure";
  reason: string;
}

const SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["yes", "no", "unsure"] },
    reason: { type: "string", description: "One or two short sentences in English, shown to the user." },
  },
  required: ["verdict", "reason"],
};

const describe = (i: Identity) =>
  JSON.stringify({ title: i.title, brand: i.brand, modelNumber: i.mpn, sku: i.sku, ean: i.gtin });

/** Ask Gemini whether two shop listings are the exact same product (same model, size, colour, variant). */
export async function judgeSameProduct(llm: LlmClient, a: Identity, b: Identity): Promise<AiSameProduct> {
  return llm.json<AiSameProduct>(
    `Are these two shop listings the exact same product, so that their prices can be compared directly?
Different size, capacity, colour, model year, region variant or bundle means "no".
Shops often use their own SKUs; that alone does not make them different. Answer "unsure" if the data is not enough.

Listing A: ${describe(a)}
Listing B: ${describe(b)}`,
    SCHEMA,
  );
}
