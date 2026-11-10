import type { ProductData } from "@/core/extract/types";
import { clean, normalizeCode, normalizeGtin } from "@/core/extract/util";

/** What we remember about a product/listing to recognise it again. */
export interface Identity {
  title: string | null;
  brand: string | null;
  sku: string | null;
  mpn: string | null;
  gtin: string | null;
}

export function identityOf(p: Pick<ProductData, "name" | "brand" | "sku" | "mpn" | "gtin">): Identity {
  return { title: p.name, brand: p.brand, sku: p.sku, mpn: p.mpn, gtin: p.gtin };
}

function codes(i: Identity): Set<string> {
  return new Set([normalizeCode(i.mpn), normalizeCode(i.sku)].filter((x): x is string => !!x));
}

const STOP = new Set(["the", "and", "with", "for", "med", "og", "til", "af", "inch", "tommer", "new", "ny"]);

export function tokens(s: string | null | undefined): Set<string> {
  return new Set(
    (clean(s) ?? "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9æøå]+/)
      .filter((t) => t.length >= 2 && !STOP.has(t)),
  );
}

/** Share of the smaller title's tokens that also appear in the other title (0..1). */
export function titleSimilarity(a: string | null, b: string | null): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / Math.min(ta.size, tb.size);
}

const sameBrand = (a: string | null, b: string | null) =>
  !a || !b || normalizeCode(a) === normalizeCode(b) || titleSimilarity(a, b) >= 1;

export type IdentityCheck =
  | { ok: true; matchedOn: "gtin" | "code" | "title" }
  | { ok: false; reason: "identity_mismatch" | "identity_missing"; detail: string };

/**
 * Periodic check: is the product on the page still the one we saved?
 * Identifiers saved at creation must be present on the main product and equal.
 */
export function checkIdentity(expected: Identity, found: Identity): IdentityCheck {
  const eg = normalizeGtin(expected.gtin);
  const fg = normalizeGtin(found.gtin);
  if (eg && fg) {
    return eg === fg
      ? { ok: true, matchedOn: "gtin" }
      : { ok: false, reason: "identity_mismatch", detail: `EAN ${found.gtin} instead of ${expected.gtin}` };
  }

  const ec = codes(expected);
  const fc = codes(found);
  if (ec.size) {
    if (!fc.size && !fg) {
      return { ok: false, reason: "identity_missing", detail: `expected ${[expected.mpn, expected.sku].filter(Boolean).join(" / ")}` };
    }
    // Shops mix up "sku" and "mpn", so compare across both.
    for (const c of ec) if (fc.has(c)) return { ok: true, matchedOn: "code" };
    if (fc.size) {
      return {
        ok: false,
        reason: "identity_mismatch",
        detail: `found ${[found.mpn, found.sku].filter(Boolean).join(" / ")}, expected ${[expected.mpn, expected.sku].filter(Boolean).join(" / ")}`,
      };
    }
  }
  if (eg && !fg && !fc.size) {
    return { ok: false, reason: "identity_missing", detail: `expected EAN ${expected.gtin}` };
  }

  // No identifiers were saved: fall back to title + brand.
  if (!sameBrand(expected.brand, found.brand)) {
    return { ok: false, reason: "identity_mismatch", detail: `brand ${found.brand} instead of ${expected.brand}` };
  }
  if (titleSimilarity(expected.title, found.title) >= 0.6) return { ok: true, matchedOn: "title" };
  return { ok: false, reason: "identity_mismatch", detail: `title "${found.title}" instead of "${expected.title}"` };
}

export type SameProductVerdict = "same" | "different" | "unsure";

/**
 * Adding a link to an existing product: are these the same product?
 * Conservative — anything that isn't clear-cut is "unsure" (then Gemini + the user decide).
 */
export function compareProducts(a: Identity, b: Identity): { verdict: SameProductVerdict; reason: string } {
  const ag = normalizeGtin(a.gtin);
  const bg = normalizeGtin(b.gtin);
  if (ag && bg) {
    return ag === bg
      ? { verdict: "same", reason: `Same EAN/GTIN (${a.gtin}).` }
      : { verdict: "different", reason: `Different EAN/GTIN: ${a.gtin} vs ${b.gtin}.` };
  }
  const ac = codes(a);
  const bc = codes(b);
  for (const c of ac) if (bc.has(c)) return { verdict: "same", reason: `Same model number (${c}).` };

  // Model number from one side appearing in the other's title is a strong signal.
  const bTitle = normalizeCode(b.title) ?? "";
  const aTitle = normalizeCode(a.title) ?? "";
  for (const c of ac) if (c.length >= 5 && bTitle.includes(c)) return { verdict: "same", reason: `Model number ${c} appears in the title.` };
  for (const c of bc) if (c.length >= 5 && aTitle.includes(c)) return { verdict: "same", reason: `Model number ${c} appears in the title.` };

  if (!sameBrand(a.brand, b.brand)) return { verdict: "different", reason: `Different brands: ${a.brand} vs ${b.brand}.` };
  const sim = titleSimilarity(a.title, b.title);
  if (sim < 0.3) return { verdict: "different", reason: "The titles have almost nothing in common." };
  return {
    verdict: "unsure",
    reason: ac.size && bc.size ? "Different model numbers / SKUs, but similar titles." : "No shared identifiers to compare.",
  };
}
