import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { alertRules, checkLogs, listings, pricePoints, products, type Listing, type Product } from "@/db/schema";
import { env } from "@/lib/env";
import { toMinor } from "@/lib/money";
import type { AnalyzeSuccess } from "./analyze";
import { compareProducts, identityOf, type Identity, type SameProductVerdict } from "./identity/match";
import { domainOf, normalizeUrl, sameUrl } from "./identity/normalize-url";
import { convertToBase, refreshRates } from "./pricing/fx";
import type { Preview } from "./previews";

export function productIdentity(p: Product): Identity {
  return { title: p.name, brand: p.brand, mpn: p.mpn, gtin: p.gtin, sku: null };
}

export function listingIdentity(l: Listing): Identity {
  return { title: l.identityTitle, brand: l.identityBrand, mpn: l.identityMpn, sku: l.identitySku, gtin: l.identityGtin };
}

export interface ProductMatch {
  productId: number;
  name: string;
  imageUrl: string | null;
  verdict: SameProductVerdict;
  reason: string;
}

const RANK: Record<SameProductVerdict, number> = { same: 0, unsure: 1, different: 2 };

/** Compare a candidate against every product (and each of its links); best verdict per product. */
export function compareWithProducts(db: DB, candidate: Identity, onlyProductId?: number): ProductMatch[] {
  const all = db.select().from(products).where(eq(products.archived, false)).all();
  const allListings = db.select().from(listings).all();
  return all
    .filter((p) => onlyProductId === undefined || p.id === onlyProductId)
    .map((p) => {
      const comparisons = [productIdentity(p), ...allListings.filter((l) => l.productId === p.id).map(listingIdentity)].map(
        (id) => compareProducts(id, candidate),
      );
      // A clear "different" on any identifier beats a fuzzy "same" elsewhere.
      const different = comparisons.find((c) => c.verdict === "different" && /EAN|GTIN/.test(c.reason));
      const best = different ?? comparisons.sort((a, b) => RANK[a.verdict] - RANK[b.verdict])[0];
      return { productId: p.id, name: p.name, imageUrl: p.imageUrl, ...best };
    })
    .sort((a, b) => RANK[a.verdict] - RANK[b.verdict]);
}

export function findListingByUrl(db: DB, ...urls: string[]): Listing | null {
  return (
    db
      .select()
      .from(listings)
      .all()
      .find((l) => urls.some((u) => sameUrl(u, l.url) || sameUrl(u, l.canonicalUrl) || sameUrl(u, l.lastFinalUrl))) ?? null
  );
}

export type CreateTarget = { productId: number } | { newProduct: { name: string } };

/** Save a confirmed preview as a listing (and product), including its first price point. */
export async function createListingFromPreview(db: DB, preview: Preview, target: CreateTarget) {
  const r: AnalyzeSuccess = preview.result;
  const p = r.product;
  const base = env().BASE_CURRENCY;
  const currency = p.currency ?? base;
  if (p.currency && p.currency !== base) await refreshRates(db, base);

  const priceMinor = p.price !== null ? toMinor(p.price, currency) : null;
  const priceBase = priceMinor !== null ? convertToBase(db, priceMinor, currency, base) : null;
  const now = new Date();
  // Prefer the page's declared canonical URL when it is on the same site.
  const canonical = domainOf(r.canonicalUrl) === domainOf(r.finalUrl) ? r.canonicalUrl : r.finalUrl;

  return db.transaction((tx) => {
    let productId: number;
    if ("productId" in target) {
      productId = target.productId;
      const existing = tx.select().from(products).where(eq(products.id, productId)).get();
      if (!existing) throw new Error("Product not found");
      tx.update(products)
        .set({
          imageUrl: existing.imageUrl ?? p.image,
          mpn: existing.mpn ?? p.mpn,
          gtin: existing.gtin ?? p.gtin,
          brand: existing.brand ?? p.brand,
        })
        .where(eq(products.id, productId))
        .run();
    } else {
      const created = tx
        .insert(products)
        .values({
          name: target.newProduct.name.trim() || p.name || "Unnamed product",
          brand: p.brand,
          mpn: p.mpn,
          gtin: p.gtin,
          imageUrl: p.image,
          baselinePriceBase: r.status === "ok" ? priceBase : null,
        })
        .returning({ id: products.id })
        .get();
      productId = created.id;
      // Sensible default: tell me about any price drop.
      tx.insert(alertRules).values({ productId, type: "any_drop" }).run();
    }

    const id = identityOf(p);
    const listing = tx
      .insert(listings)
      .values({
        productId,
        domain: domainOf(r.finalUrl),
        url: preview.inputUrl,
        canonicalUrl: canonical,
        normalizedUrl: normalizeUrl(canonical) ?? canonical,
        lastFinalUrl: r.finalUrl,
        identityTitle: id.title,
        identityBrand: id.brand,
        identitySku: id.sku,
        identityMpn: id.mpn,
        identityGtin: id.gtin,
        currency,
        status: r.status,
        statusReason: r.status,
        fetchMode: r.fetchMode,
        currentPriceMinor: priceMinor,
        currentPriceBase: priceBase,
        currentInStock: p.inStock !== false,
        lastCheckedAt: now,
        lastSuccessAt: now,
      })
      .returning()
      .get();

    if (priceMinor !== null) {
      tx.insert(pricePoints)
        .values({
          listingId: listing.id,
          priceMinor,
          currency,
          priceBase,
          baseCurrency: base,
          inStock: p.inStock !== false,
          source: r.source,
          checkedAt: now,
        })
        .run();
    }
    tx.insert(checkLogs)
      .values({
        listingId: listing.id,
        status: r.status,
        reason: "ok",
        message: "Added",
        httpStatus: r.httpStatus,
        finalUrl: r.finalUrl,
        fetchMode: r.fetchMode,
        checkedAt: now,
      })
      .run();

    return { productId, listingId: listing.id };
  });
}
