import type { CheerioAPI } from "cheerio";
import { sameUrl } from "@/core/identity/normalize-url";
import { emptyProduct, type ProductData } from "./types";
import {
  absoluteUrl,
  availability,
  clean,
  currencyCode,
  firstString,
  normalizeCode,
  normalizeGtin,
  structuredPrice,
} from "./util";

type Node = Record<string, unknown>;

const PRODUCT_TYPES = new Set(["product", "productgroup", "individualproduct", "productmodel"]);
const LIST_PAGE_TYPES = new Set(["collectionpage", "searchresultspage", "offercatalog"]);
const PAGE_TYPES = new Set(["webpage", "itempage", "productpage"]);
const NON_LIST_PRICES = /(listprice|strikethroughprice|msrp|srp|wasprice|invoiceprice)/i;

function types(n: Node): string[] {
  const t = n["@type"];
  const arr = Array.isArray(t) ? t : [t];
  return arr
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.replace(/^.*[/#:]/, "").toLowerCase());
}

const isProduct = (n: Node) => types(n).some((t) => PRODUCT_TYPES.has(t));

function parseBlocks($: CheerioAPI): unknown[] {
  const out: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text().trim();
    if (!raw) return;
    try {
      out.push(JSON.parse(raw));
    } catch {
      try {
        // Common breakage: raw control characters / trailing commas.
        out.push(JSON.parse(raw.replace(/[\u0000-\u001f]+/g, " ").replace(/,\s*([}\]])/g, "$1")));
      } catch {
        /* ignore unparseable block */
      }
    }
  });
  return out;
}

/**
 * Top-level nodes only: array items, @graph members and a WebPage's mainEntity.
 * Products nested anywhere else (isRelatedTo, isSimilarTo, itemListElement,
 * recommendations, …) are deliberately NOT treated as the page's product.
 */
function topLevelNodes(blocks: unknown[]): Node[] {
  const nodes: Node[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (!v || typeof v !== "object") return;
    const n = v as Node;
    if (Array.isArray(n["@graph"])) (n["@graph"] as unknown[]).forEach(visit);
    if (n["@type"]) {
      nodes.push(n);
      if (types(n).some((t) => PAGE_TYPES.has(t)) && n.mainEntity) visit(n.mainEntity);
    }
  };
  blocks.forEach(visit);
  return nodes;
}

export interface JsonLdResult {
  products: ProductData[];
  listPage: boolean;
  ambiguous: string | null;
}

export function extractJsonLd($: CheerioAPI, pageUrl: string): JsonLdResult {
  const nodes = topLevelNodes(parseBlocks($));

  const listPage = nodes.some((n) => {
    const t = types(n);
    if (t.some((x) => LIST_PAGE_TYPES.has(x))) return true;
    if (t.includes("itemlist")) {
      const items = n.itemListElement;
      return Array.isArray(items) && items.length >= 2;
    }
    return false;
  });

  // De-duplicate: the same product is often described twice (e.g. in @graph and a separate block).
  const seen = new Set<string>();
  const products: ProductData[] = [];
  let ambiguous: string | null = null;
  for (const n of nodes.filter(isProduct)) {
    const { product, ambiguous: amb } = toProduct(n, pageUrl);
    const key =
      normalizeGtin(product.gtin) ?? normalizeCode(product.mpn) ?? normalizeCode(product.sku) ?? product.name ?? "";
    if (seen.has(key)) continue;
    seen.add(key);
    products.push(product);
    ambiguous ??= amb;
  }
  return { products, listPage, ambiguous };
}

function toProduct(n: Node, pageUrl: string): { product: ProductData; ambiguous: string | null } {
  // A ProductGroup lists variants (colours, sizes) — only accept one if the page URL picks it.
  if (types(n).includes("productgroup") && Array.isArray(n.hasVariant) && n.hasVariant.length) {
    const variants = (n.hasVariant as Node[]).filter((v) => v && typeof v === "object");
    const chosen =
      variants.find((v) => sameUrl(firstString(v.url), pageUrl)) ??
      (variants.length === 1 ? variants[0] : undefined);
    if (chosen) {
      const p = toProduct({ ...n, ...chosen, hasVariant: undefined }, pageUrl).product;
      return { product: p, ambiguous: null };
    }
    const base = basicFields(n, pageUrl);
    const prices = new Set(variants.map((v) => pickOffer(v.offers, pageUrl).price).filter((x) => x !== null));
    if (prices.size === 1) {
      const offer = pickOffer(variants[0].offers, pageUrl);
      return { product: { ...base, ...offer }, ambiguous: null };
    }
    return {
      product: base,
      ambiguous: "The page offers several variants with different prices and the link does not pick one.",
    };
  }
  return { product: { ...basicFields(n, pageUrl), ...pickOffer(n.offers, pageUrl) }, ambiguous: null };
}

function basicFields(n: Node, pageUrl: string): ProductData {
  const brand = n.brand ?? n.manufacturer;
  return {
    ...emptyProduct(),
    name: clean(n.name),
    brand: typeof brand === "object" && brand !== null ? clean((brand as Node).name) : clean(brand),
    sku: clean(n.sku),
    mpn: clean(n.mpn),
    gtin: clean(n.gtin13 ?? n.gtin ?? n.gtin12 ?? n.gtin14 ?? n.gtin8 ?? n.isbn),
    image: absoluteUrl(firstString(n.image), pageUrl),
    url: absoluteUrl(firstString(n.url), pageUrl),
  };
}

interface OfferInfo {
  price: number | null;
  currency: string | null;
  inStock: boolean | null;
}

function offerInfo(o: Node): OfferInfo & { url: string | null } {
  let price = structuredPrice(o.price ?? o.lowPrice);
  let currency = currencyCode(o.priceCurrency);
  const specs = ([] as unknown[]).concat(o.priceSpecification ?? []) as Node[];
  if (price === null || currency === null) {
    // Prefer the actual selling price over list / strike-through prices.
    const spec =
      specs.find((s) => s && typeof s === "object" && !NON_LIST_PRICES.test(String(s.priceType ?? ""))) ?? specs[0];
    if (spec) {
      price ??= structuredPrice(spec.price ?? spec.minPrice);
      currency ??= currencyCode(spec.priceCurrency);
    }
  }
  return { price, currency, inStock: availability(o.availability), url: firstString(o.url) };
}

/**
 * Several offers for the same product usually means several sellers. They are all the
 * same product, so the lowest in-stock price is the honest "current price".
 */
function pickOffer(offers: unknown, pageUrl: string): OfferInfo {
  const list = (Array.isArray(offers) ? offers : offers ? [offers] : []).filter(
    (o): o is Node => !!o && typeof o === "object",
  );
  // AggregateOffer may contain nested offers.
  const flat = list.flatMap((o) => (Array.isArray(o.offers) ? (o.offers as Node[]) : [o]));
  const infos = flat.map(offerInfo).filter((i) => i.price !== null);
  if (!infos.length) {
    const first = flat[0] ? offerInfo(flat[0]) : null;
    return { price: null, currency: first?.currency ?? null, inStock: first?.inStock ?? null };
  }
  const exact = infos.find((i) => i.url && sameUrl(i.url, pageUrl));
  if (exact) return { price: exact.price, currency: exact.currency, inStock: exact.inStock };
  const inStock = infos.filter((i) => i.inStock !== false);
  const pool = inStock.length ? inStock : infos;
  const best = pool.reduce((a, b) => (b.price! < a.price! ? b : a));
  return { price: best.price, currency: best.currency, inStock: inStock.length ? (best.inStock ?? null) : false };
}
