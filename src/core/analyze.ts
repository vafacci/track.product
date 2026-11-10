import type { FetchMode, ListingStatus, PriceSource } from "@/db/schema";
import { extractWithAi } from "./ai/extract-product";
import type { LlmClient } from "./ai/gemini";
import { pageText } from "./extract/clean-html";
import { extractStructured } from "./extract";
import type { ProductData } from "./extract/types";
import type { FetchedPage } from "./fetch/types";
import { classifyPage } from "./identity/classify-page";
import { checkIdentity, identityOf, type Identity } from "./identity/match";
import { CheckError, REASONS, type ReasonCode } from "./reasons";

export interface AnalyzeOptions {
  /** URLs accepted as the product page. Defaults to the requested URL. */
  knownUrls?: string[];
  /** Saved identity (periodic check). When set, the page must show this exact product. */
  expected?: Identity;
  /** Saved currency (periodic check). */
  expectedCurrency?: string;
  /** Periodic check: any redirect away from known URLs needs attention, even if a product is found. */
  strictUrl?: boolean;
  /** AI fallback; null disables it. */
  llm: LlmClient | null;
}

export interface AnalyzeSuccess {
  ok: true;
  status: Extract<ListingStatus, "ok" | "out_of_stock">;
  product: ProductData;
  source: PriceSource;
  finalUrl: string;
  canonicalUrl: string;
  redirectChain: string[];
  httpStatus: number;
  fetchMode: FetchMode;
  warnings: string[];
}

export interface AnalyzeFailure {
  ok: false;
  status: ListingStatus;
  reason: ReasonCode;
  message: string;
  detail?: string;
  finalUrl?: string;
  redirectChain?: string[];
  httpStatus?: number;
  fetchMode?: FetchMode;
}

export type AnalyzeResult = AnalyzeSuccess | AnalyzeFailure;

export function failure(e: CheckError, page?: FetchedPage): AnalyzeFailure {
  return {
    ok: false,
    status: e.status,
    reason: e.reason,
    message: REASONS[e.reason].text,
    detail: e.detail,
    finalUrl: page?.finalUrl,
    redirectChain: page?.redirectChain,
    httpStatus: e.httpStatus ?? page?.status,
    fetchMode: page?.mode,
  };
}

/** Currency hint from the shop's domain/path, only used when the page doesn't state one. */
function currencyFromUrl(url: string): string | null {
  const u = new URL(url);
  const host = u.hostname;
  const path = u.pathname.toLowerCase();
  if (host.endsWith(".dk") || /\/(da-dk|dk)(\/|$)/.test(path)) return "DKK";
  if (host.endsWith(".se") || /\/(sv-se|se)(\/|$)/.test(path)) return "SEK";
  if (host.endsWith(".no") || /\/(nb-no|no)(\/|$)/.test(path)) return "NOK";
  if (host.endsWith(".uk") || /\/(en-gb|en-uk|uk)(\/|$)/.test(path)) return "GBP";
  if (/\.(de|fr|nl|es|it|fi|ie|at|be|pt)$/.test(host)) return "EUR";
  return null;
}

/**
 * Turn a fetched page into a verified price — or a clear reason why not.
 * Order: classify page -> structured data -> (AI fallback) -> identity -> price sanity.
 */
export async function analyzePage(page: FetchedPage, opts: AnalyzeOptions): Promise<AnalyzeResult> {
  try {
    const knownUrls = opts.knownUrls?.length ? opts.knownUrls : [page.requestedUrl];
    const ex = extractStructured(page.html, page.finalUrl);
    const cls = classifyPage(page, ex, knownUrls);
    const warnings: string[] = [];

    let product: ProductData;
    let source: PriceSource;
    if (cls.kind === "product") {
      product = ex.product!;
      source = ex.source!;
      if (cls.redirected) {
        if (opts.strictUrl) throw new CheckError("url_changed", `now ${page.finalUrl}`, page.status);
        warnings.push(`The link redirected to ${page.finalUrl}. Check that this is the product you meant.`);
      }
    } else {
      if (!opts.llm) throw new CheckError("gemini_unavailable");
      const ai = await extractWithAi(opts.llm, pageText(page.html), page.finalUrl);
      if (ai.pageType === "product_list") throw new CheckError("category_page", "detected by AI", page.status);
      if (ai.pageType === "error_or_not_found") throw new CheckError("error_page", "detected by AI", page.status);
      if (!ai.product) throw new CheckError("no_product_data", undefined, page.status);
      product = ai.product;
      source = "gemini";
      warnings.push("No structured data on this page — read by AI and verified against the page text.");
      if (ai.rejected.length) warnings.push(`Ignored AI values not found on the page: ${ai.rejected.join(", ")}.`);
    }

    if (opts.expected) {
      const id = checkIdentity(opts.expected, identityOf(product));
      if (!id.ok) throw new CheckError(id.reason, id.detail, page.status);
    }

    if (product.price !== null && !product.currency) {
      product.currency = currencyFromUrl(page.finalUrl);
      if (!product.currency) throw new CheckError("no_price", "the page does not say which currency", page.status);
      warnings.push(`The page does not state a currency; assuming ${product.currency} from the address.`);
    }
    if (opts.expectedCurrency && product.currency && product.currency !== opts.expectedCurrency) {
      throw new CheckError("currency_changed", `${product.currency} instead of ${opts.expectedCurrency}`, page.status);
    }

    const outOfStock = product.inStock === false;
    if (product.price === null && !outOfStock) throw new CheckError("no_price", undefined, page.status);
    if (product.price !== null && product.price <= 0) throw new CheckError("no_price", "price is zero", page.status);

    return {
      ok: true,
      status: outOfStock ? "out_of_stock" : "ok",
      product,
      source,
      finalUrl: page.finalUrl,
      canonicalUrl: ex.signals.canonicalUrl ?? page.finalUrl,
      redirectChain: page.redirectChain,
      httpStatus: page.status,
      fetchMode: page.mode,
      warnings,
    };
  } catch (e) {
    if (e instanceof CheckError) return failure(e, page);
    throw e;
  }
}
