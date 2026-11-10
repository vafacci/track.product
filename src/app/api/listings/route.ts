import { z } from "zod";
import { createListingFromPreview } from "@/core/listings";
import { deletePreview, getPreview } from "@/core/previews";
import { db } from "@/db/client";

const Body = z.object({
  previewId: z.string(),
  productId: z.number().int().optional(),
  newProductName: z.string().max(300).optional(),
});

/** Step 2 of "Add link": the user confirmed the preview. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "Invalid request" }, { status: 400 });
  const { previewId, productId, newProductName } = parsed.data;

  const preview = getPreview(previewId);
  if (!preview) return Response.json({ message: "The preview expired. Please paste the link again." }, { status: 404 });

  const target =
    productId !== undefined ? { productId } : { newProduct: { name: newProductName ?? preview.result.product.name ?? "" } };
  const created = await createListingFromPreview(db(), preview, target);
  deletePreview(previewId);
  return Response.json({ ok: true, ...created });
}
