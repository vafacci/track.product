import * as cheerio from "cheerio";
import type { PriceSource } from "@/db/schema";
import { extractJsonLd } from "./jsonld";
import { extractMeta } from "./meta";
import { extractMicrodata } from "./microdata";
import type { Extraction, PageSignals, ProductData } from "./types";
import { absoluteUrl, clean, findErrorMessage } from "./util";

export type { Extraction, ProductData, PageSignals } from "./types";

/**
 * Structured extraction (no AI): JSON-LD first, then microdata, then meta tags.
 * Only the page's single main product is returned; if there are several
 * candidate products, `product` is null and `ambiguous` explains why.
 */
export function extractStructured(html: string, pageUrl: string): Extraction {
  const $ = cheerio.load(html);
  const jsonld = extractJsonLd($, pageUrl);
  const micro = extractMicrodata($, pageUrl);
  const meta = extractMeta($, pageUrl);

  const title = clean($("title").first().text());
  const h1 = clean($("h1").first().text());
  const signals: PageSignals = {
    title,
    h1,
    canonicalUrl: absoluteUrl(clean($('link[rel="canonical"]').attr("href")), pageUrl),
    ogType: clean($('meta[property="og:type"]').attr("content"))?.toLowerCase() ?? null,
    jsonLdProductCount: jsonld.products.length,
    jsonLdListPage: jsonld.listPage,
    microdataProductCount: micro.length,
    errorMessage: findErrorMessage(title, h1),
  };

  let main: ProductData | null = null;
  let source: PriceSource | null = null;
  let ambiguous: string | null = null;

  if (jsonld.products.length > 1) {
    ambiguous = `The page describes ${jsonld.products.length} different products.`;
  } else if (jsonld.products.length === 1) {
    main = jsonld.products[0];
    source = "jsonld";
    ambiguous = jsonld.ambiguous;
  } else if (micro.length > 1) {
    ambiguous = `The page contains ${micro.length} different products.`;
  } else if (micro.length === 1) {
    main = micro[0];
    source = "microdata";
  } else if (meta) {
    main = meta;
    source = "meta";
  }

  if (main && !ambiguous) {
    // Fill gaps from the other sources. They describe the same page, and we only
    // ever have one candidate product per source at this point.
    const extras: [ProductData | null, PriceSource][] = [
      [micro.length === 1 ? micro[0] : null, "microdata"],
      [meta, "meta"],
    ];
    for (const [extra, extraSource] of extras) {
      if (!extra || extra === main) continue;
      for (const k of ["name", "brand", "sku", "mpn", "gtin", "image", "url"] as const) main[k] ??= extra[k];
      if (main.price === null && extra.price !== null) {
        main.price = extra.price;
        main.currency ??= extra.currency;
        source = extraSource;
      }
      main.inStock ??= extra.inStock;
      main.currency ??= extra.currency;
    }
  }

  return { product: ambiguous ? null : main, source: ambiguous ? null : source, ambiguous, signals };
}
