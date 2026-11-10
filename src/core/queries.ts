import { asc, desc, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { listings, products, type Listing, type Product } from "@/db/schema";

export interface ProductSummary {
  product: Product;
  listings: Listing[];
  /** Cheapest in-stock listing with a price (base currency). Out-of-stock links don't count. */
  best: Listing | null;
  attention: Listing[];
}

export function lowestListing(ls: Listing[]): Listing | null {
  return (
    ls
      .filter((l) => l.active && l.status === "ok" && l.currentInStock !== false && l.currentPriceBase !== null)
      .sort((a, b) => a.currentPriceBase! - b.currentPriceBase!)[0] ?? null
  );
}

function summarize(product: Product, ls: Listing[]): ProductSummary {
  return {
    product,
    listings: ls,
    best: lowestListing(ls),
    attention: ls.filter((l) => l.status === "needs_attention" || l.status === "not_found"),
  };
}

export function productSummaries(db: DB): ProductSummary[] {
  const ps = db.select().from(products).where(eq(products.archived, false)).orderBy(desc(products.createdAt)).all();
  const ls = db.select().from(listings).orderBy(asc(listings.id)).all();
  return ps.map((p) => summarize(p, ls.filter((l) => l.productId === p.id)));
}

export function productSummary(db: DB, id: number): ProductSummary | null {
  const p = db.select().from(products).where(eq(products.id, id)).get();
  if (!p) return null;
  return summarize(p, db.select().from(listings).where(eq(listings.productId, id)).orderBy(asc(listings.id)).all());
}
