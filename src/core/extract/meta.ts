import type { CheerioAPI } from "cheerio";
import { emptyProduct, type ProductData } from "./types";
import { absoluteUrl, availability, clean, currencyCode, structuredPrice } from "./util";

/** OpenGraph / product meta tags. Only counts as a product if the tags say so. */
export function extractMeta($: CheerioAPI, pageUrl: string): ProductData | null {
  const meta = (...names: string[]): string | null => {
    for (const n of names) {
      const v = clean($(`meta[property="${n}"], meta[name="${n}"], meta[itemprop="${n}"]`).first().attr("content"));
      if (v) return v;
    }
    return null;
  };

  const ogType = meta("og:type")?.toLowerCase() ?? "";
  const price = structuredPrice(meta("product:price:amount", "og:price:amount", "product:sale_price:amount"));
  if (!ogType.includes("product") && price === null) return null;

  return {
    ...emptyProduct(),
    name: meta("og:title", "twitter:title"),
    brand: meta("product:brand", "og:brand"),
    sku: meta("product:retailer_item_id", "product:sku"),
    mpn: meta("product:mfr_part_no", "product:mpn"),
    gtin: meta("product:ean", "product:gtin", "product:upc"),
    price,
    currency: currencyCode(meta("product:price:currency", "og:price:currency", "product:sale_price:currency")),
    inStock: availability(meta("product:availability", "og:availability")),
    image: absoluteUrl(meta("og:image", "twitter:image"), pageUrl),
    url: absoluteUrl(meta("og:url"), pageUrl),
  };
}
