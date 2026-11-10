import { parsePrice } from "@/lib/money";

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
};

export function clean(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return String(v);
  if (typeof v !== "string") return null;
  const s = v
    .replace(/&(amp|quot|#39|apos|lt|gt|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
  return s === "" ? null : s;
}

/** Prices in structured data should use "." as decimal separator; fall back to lenient parsing. */
export function structuredPrice(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : null;
  if (typeof v === "string" && /^\s*\d+(\.\d+)?\s*$/.test(v)) return Number(v);
  return parsePrice(v);
}

export function currencyCode(v: unknown): string | null {
  const s = clean(v)?.toUpperCase();
  if (!s) return null;
  if (/^[A-Z]{3}$/.test(s)) return s;
  const symbols: Record<string, string> = { "£": "GBP", "€": "EUR", $: "USD", KR: "DKK", "KR.": "DKK" };
  return symbols[s] ?? null;
}

/** schema.org availability -> in stock? null if unknown. */
export function availability(v: unknown): boolean | null {
  const s = clean(v)?.toLowerCase();
  if (!s) return null;
  const compact = s.replace(/[\s_-]/g, "");
  // Check "out" first: "unavailable" contains "available".
  if (/(outofstock|soldout|discontinued|unavailable|notavailable|udsolgt|ikkepålager)/.test(compact)) return false;
  if (/(instock|limitedavailability|onlineonly|instoreonly|preorder|presale|backorder|available|pålager)/.test(compact))
    return true;
  return null;
}

export function normalizeGtin(v: unknown): string | null {
  const s = clean(v)?.replace(/\D/g, "");
  if (!s || s.length < 8 || s.length > 14) return null;
  return s.replace(/^0+/, "");
}

/** Model numbers / SKUs: case- and punctuation-insensitive. */
export function normalizeCode(v: unknown): string | null {
  const s = clean(v)?.toUpperCase().replace(/[\s\-_./]/g, "");
  return s && s.length >= 2 ? s : null;
}

export function firstString(v: unknown): string | null {
  if (Array.isArray(v)) {
    for (const x of v) {
      const s = firstString(x);
      if (s) return s;
    }
    return null;
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return firstString(o.url ?? o.contentUrl ?? o.name ?? o["@id"]);
  }
  return clean(v);
}

export function absoluteUrl(v: string | null, base: string): string | null {
  if (!v) return null;
  try {
    return new URL(v, base).toString();
  } catch {
    return null;
  }
}

/** Phrases that mean "this is not the page you asked for". Checked in title / h1 only. */
const ERROR_PATTERNS = [
  /page (was )?not found/i,
  /\b404\b/,
  /(you have been|you've been|has been|were) redirected/i,
  /page (you|you're|you are) (are )?(looking for|requested)/i,
  /(could not|couldn't|cannot|can't) (be )?f(i|ou)nd (the|this|that)? ?page/i,
  /(product|item|page) (is )?no longer available/i,
  /(this|the) (product|item) (does not|doesn't) exist/i,
  /siden (blev ikke fundet|findes ikke|kunne ikke findes)/i,
  /(produktet|varen) (findes ikke|er ikke længere)/i,
];

export function findErrorMessage(...texts: (string | null)[]): string | null {
  for (const t of texts) {
    if (!t) continue;
    if (ERROR_PATTERNS.some((r) => r.test(t))) return t.slice(0, 200);
  }
  return null;
}
