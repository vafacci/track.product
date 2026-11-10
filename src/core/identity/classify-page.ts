import type { Extraction } from "@/core/extract/types";
import type { FetchedPage } from "@/core/fetch/types";
import { CheckError } from "@/core/reasons";
import { sameUrl } from "./normalize-url";

export type Classification =
  /** A single main product was found in structured data. */
  | { kind: "product"; redirected: boolean }
  /** No structured product, but nothing says it's the wrong page: the AI fallback may look. */
  | { kind: "needs_ai" };

/**
 * Decide what kind of page we got BEFORE trusting any price on it.
 * Throws CheckError when the page is clearly not the product page.
 *
 * `knownUrls`: URLs that are accepted as "the product page" (the pasted URL,
 * plus at check time the saved canonical URL and the last accepted final URL).
 */
export function classifyPage(page: FetchedPage, ex: Extraction, knownUrls: string[]): Classification {
  const { signals } = ex;

  if (page.status === 404 || page.status === 410) throw new CheckError("http_404", undefined, page.status);
  if (signals.errorMessage) throw new CheckError("error_page", `"${signals.errorMessage}"`, page.status);

  const known = (u: string | null) => !!u && knownUrls.some((k) => sameUrl(k, u));
  // The page counts as "where we expected to be" if either the URL we ended up
  // on, or the canonical URL the page declares, is one we know.
  const redirected = !known(page.finalUrl) && !known(signals.canonicalUrl);
  const where = page.finalUrl !== page.requestedUrl ? `ended on ${page.finalUrl}` : undefined;

  const listSignals = signals.jsonLdListPage || signals.microdataProductCount > 2;

  if (ex.ambiguous) {
    if (listSignals || redirected) throw new CheckError("category_page", where, page.status);
    throw new CheckError("multiple_products", ex.ambiguous, page.status);
  }

  if (!ex.product) {
    if (listSignals) throw new CheckError("category_page", where, page.status);
    // Redirected somewhere without a product (e.g. Dell -> accessories page):
    // never let the AI go looking for "a" product on such a page.
    if (redirected) throw new CheckError("redirected_elsewhere", where, page.status);
    return { kind: "needs_ai" };
  }

  return { kind: "product", redirected };
}
