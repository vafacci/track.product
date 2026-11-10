import { z } from "zod";
import { geminiClient } from "@/core/ai/gemini";
import { judgeSameProduct } from "@/core/ai/same-product";
import { identityOf } from "@/core/identity/match";
import { compareWithProducts, productIdentity } from "@/core/listings";
import { getPreview } from "@/core/previews";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";

const Body = z.object({ productId: z.number().int() });

/** "Is this the same product as the one I'm adding it to?" Rules first, Gemini when unsure. */
export async function POST(req: Request, ctx: RouteContext<"/api/preview/[id]/compare">) {
  const { id } = await ctx.params;
  const preview = getPreview(id);
  if (!preview) return Response.json({ message: "The preview expired. Please paste the link again." }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "Invalid request" }, { status: 400 });

  const candidate = identityOf(preview.result.product);
  const [match] = compareWithProducts(db(), candidate, parsed.data.productId);
  if (!match) return Response.json({ message: "Product not found" }, { status: 404 });

  let ai: { verdict: string; reason: string } | null = null;
  const llm = geminiClient();
  if (match.verdict === "unsure" && llm) {
    const product = db().select().from(schema.products).where(eq(schema.products.id, parsed.data.productId)).get()!;
    ai = await judgeSameProduct(llm, productIdentity(product), candidate).catch(() => null);
  }
  return Response.json({ verdict: match.verdict, reason: match.reason, ai });
}
