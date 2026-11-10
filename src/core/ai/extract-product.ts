import { emptyProduct, type ProductData } from "@/core/extract/types";
import { clean, currencyCode, normalizeCode, normalizeGtin } from "@/core/extract/util";
import { tokens } from "@/core/identity/match";
import { parsePrice } from "@/lib/money";
import type { LlmClient } from "./gemini";

export type AiPageType = "single_product" | "product_list" | "error_or_not_found" | "other";

export interface AiExtraction {
  pageType: AiPageType;
  product: ProductData | null;
  /** Fields the AI returned that we dropped because they are not on the page. */
  rejected: string[];
}

const nullable = (type: string, description: string) => ({ type: [type, "null"], description });

const SCHEMA = {
  type: "object",
  properties: {
    pageType: {
      type: "string",
      enum: ["single_product", "product_list", "error_or_not_found", "other"],
      description:
        "single_product: the page is about exactly one product that can be bought. product_list: category, search results or several products. error_or_not_found: error, 'not found' or 'you have been redirected' page.",
    },
    name: nullable("string", "Main product name exactly as written on the page."),
    brand: nullable("string", "Brand of the main product."),
    mpn: nullable("string", "Manufacturer part / model number, exactly as written on the page."),
    sku: nullable("string", "Shop's own item number, exactly as written on the page."),
    gtin: nullable("string", "EAN / GTIN / UPC barcode number, digits only."),
    priceText: nullable(
      "string",
      "The main product's current selling price copied EXACTLY as it appears in the text, e.g. '449,95 kr.'. Not a crossed-out price, not a monthly price, not shipping.",
    ),
    price: nullable("number", "The same price as a number, e.g. 449.95."),
    currency: nullable("string", "ISO 4217 code of that price, e.g. DKK, GBP, EUR."),
    inStock: nullable("boolean", "true if the page says it can be bought now, false if out of stock / sold out, null if not stated."),
  },
  required: ["pageType", "name", "brand", "mpn", "sku", "gtin", "priceText", "price", "currency", "inStock"],
};

interface Raw {
  pageType: AiPageType;
  name: string | null;
  brand: string | null;
  mpn: string | null;
  sku: string | null;
  gtin: string | null;
  priceText: string | null;
  price: number | null;
  currency: string | null;
  inStock: boolean | null;
}

function prompt(text: string, url: string): string {
  return `You extract product data from the text of a web shop page.

Rules:
- Extract ONLY the page's main product: the single product the page is about.
- Ignore recommendations, carousels, "customers also bought", accessories, bundles, banners and any other product.
- If the page shows several products, a category, search results, an error, or a message like "page not found" or
  "you have been redirected", set pageType accordingly and return null for all product fields.
- Return null for any field that is not explicitly present in the text. Never guess, never compute, never use outside knowledge.

URL: ${url}

PAGE TEXT:
"""
${text}
"""`;
}

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

/**
 * AI fallback for pages without structured data. Everything the model returns
 * is verified against the page text; unverifiable values are dropped.
 */
export async function extractWithAi(llm: LlmClient, text: string, url: string): Promise<AiExtraction> {
  const raw = await llm.json<Raw>(prompt(text, url), SCHEMA);
  if (raw.pageType !== "single_product") return { pageType: raw.pageType ?? "other", product: null, rejected: [] };

  const page = squash(text);
  const pageCodes = normalizeCode(text) ?? "";
  const pageDigits = text.replace(/\D/g, "");
  const rejected: string[] = [];
  const keep = <T>(field: string, value: T | null, ok: boolean): T | null => {
    if (value === null || value === undefined) return null;
    if (ok) return value;
    rejected.push(field);
    return null;
  };

  // Name: most of its words must be on the page.
  const nameTokens = [...tokens(raw.name)];
  const nameOk = nameTokens.length > 0 && nameTokens.filter((t) => page.includes(t)).length / nameTokens.length >= 0.7;

  // Price: the exact price text must be on the page and must parse to the same number.
  const priceText = clean(raw.priceText);
  const parsed = parsePrice(priceText);
  const priceOk =
    !!priceText && page.includes(squash(priceText)) && parsed !== null && raw.price !== null && Math.abs(parsed - raw.price) < 0.01;

  const code = (v: string | null) => {
    const c = normalizeCode(v);
    return !!c && pageCodes.includes(c);
  };
  const gtin = normalizeGtin(raw.gtin);

  const product: ProductData = {
    ...emptyProduct(),
    name: keep("name", clean(raw.name), nameOk),
    brand: keep("brand", clean(raw.brand), !!raw.brand && page.includes(squash(raw.brand))),
    mpn: keep("mpn", clean(raw.mpn), code(raw.mpn)),
    sku: keep("sku", clean(raw.sku), code(raw.sku)),
    gtin: keep("gtin", gtin, !!gtin && pageDigits.includes(gtin)),
    price: keep("price", parsed, priceOk),
    currency: priceOk ? currencyCode(raw.currency) : null,
    inStock: typeof raw.inStock === "boolean" ? raw.inStock : null,
  };
  if (!product.name) return { pageType: "other", product: null, rejected };
  return { pageType: "single_product", product, rejected };
}
