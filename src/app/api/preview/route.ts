import { z } from "zod";
import { geminiClient } from "@/core/ai/gemini";
import { identityOf } from "@/core/identity/match";
import { cleanUrl, normalizeUrl } from "@/core/identity/normalize-url";
import { compareWithProducts, findListingByUrl } from "@/core/listings";
import { analyzeUrl } from "@/core/pipeline";
import { savePreview } from "@/core/previews";
import { db } from "@/db/client";

const Body = z.object({ url: z.string().trim().min(1) });

/** Step 1 of "Add link": fetch + verify the page and return a preview. Nothing is saved yet. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !normalizeUrl(parsed.data.url)) {
    return Response.json({ ok: false, message: "Please paste a full link starting with https://" }, { status: 400 });
  }
  const url = cleanUrl(parsed.data.url);

  const existing = findListingByUrl(db(), url);
  if (existing) {
    return Response.json({
      ok: false,
      reason: "duplicate",
      message: "This link is already being tracked.",
      productId: existing.productId,
    });
  }

  const result = await analyzeUrl(url, { llm: geminiClient() });
  if (!result.ok) return Response.json(result);

  const afterRedirect = findListingByUrl(db(), result.finalUrl, result.canonicalUrl);
  if (afterRedirect) {
    return Response.json({
      ok: false,
      reason: "duplicate",
      message: "This product page is already being tracked (via another link).",
      productId: afterRedirect.productId,
    });
  }

  const preview = savePreview(url, result);
  return Response.json({
    ...result,
    previewId: preview.id,
    matches: compareWithProducts(db(), identityOf(result.product)).filter((m) => m.verdict !== "different").slice(0, 5),
  });
}
