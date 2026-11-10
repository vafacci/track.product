import type { PriceSource } from "@/db/schema";

export interface ProductData {
  name: string | null;
  brand: string | null;
  sku: string | null;
  mpn: string | null;
  gtin: string | null;
  /** Price in major units (e.g. 2499.95). */
  price: number | null;
  currency: string | null;
  inStock: boolean | null;
  image: string | null;
  url: string | null;
}

/** Facts about the page as a whole, used to tell product pages from other pages. */
export interface PageSignals {
  title: string | null;
  h1: string | null;
  canonicalUrl: string | null;
  ogType: string | null;
  /** Distinct Product entities at the top level of JSON-LD (not nested in related/recommended items). */
  jsonLdProductCount: number;
  /** JSON-LD says the page is a list (ItemList with items, CollectionPage, SearchResultsPage). */
  jsonLdListPage: boolean;
  /** Top-level microdata Product blocks. */
  microdataProductCount: number;
  /** A "not found / redirected" style message in the page title or heading. */
  errorMessage: string | null;
}

export interface Extraction {
  product: ProductData | null;
  source: PriceSource | null;
  /** Set when there are product entities but none is clearly the main one. */
  ambiguous: string | null;
  signals: PageSignals;
}

export function emptyProduct(): ProductData {
  return {
    name: null,
    brand: null,
    sku: null,
    mpn: null,
    gtin: null,
    price: null,
    currency: null,
    inStock: null,
    image: null,
    url: null,
  };
}
