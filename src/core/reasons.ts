import type { ListingStatus } from "@/db/schema";

/**
 * Every failed check gets a reason code + a plain-English explanation that is
 * shown in the UI, so the user always knows why a link has no price.
 */
export const REASONS = {
  // Fetch problems (temporary -> status "error")
  timeout: { status: "error", text: "The shop did not respond in time. We'll try again later." },
  network_error: { status: "error", text: "Could not connect to the shop. We'll try again later." },
  blocked: {
    status: "error",
    text: "The shop blocks automated price checks (bot protection). We will retry later, but some shops never allow it — then track the product at another shop.",
  },
  http_error: { status: "error", text: "The shop returned an unexpected error." },
  not_html: { status: "error", text: "The link did not return a web page." },
  too_many_redirects: { status: "error", text: "The link redirects in a loop." },
  gemini_unavailable: {
    status: "error",
    text: "No structured product data on the page, and the AI fallback (Gemini) is not configured.",
  },

  // The product is gone (status "not_found")
  http_404: { status: "not_found", text: "The shop says this page no longer exists (HTTP 404/410)." },
  error_page: { status: "not_found", text: "The page shows a 'not found' or 'you have been redirected' message." },
  category_page: {
    status: "not_found",
    text: "The link now shows a list of several products (category or search page), not a single product.",
  },
  redirected_elsewhere: {
    status: "not_found",
    text: "The link redirects to a different page without this product. If the page opens fine in your own browser, the shop is probably sending automated price checks elsewhere — try the same product at another shop.",
  },

  // Something doesn't add up (status "needs_attention")
  url_changed: {
    status: "needs_attention",
    text: "The link now ends on a different URL than when it was added. Please check it is still the same product.",
  },
  multiple_products: {
    status: "needs_attention",
    text: "The page contains several products and none is clearly the main one.",
  },
  no_product_data: { status: "needs_attention", text: "Could not find a product on the page." },
  identity_mismatch: {
    status: "needs_attention",
    text: "The model number / SKU / EAN on the page does not match the product that was added.",
  },
  identity_missing: {
    status: "needs_attention",
    text: "The model number / SKU / EAN saved when the link was added can no longer be found on the page.",
  },
  no_price: { status: "needs_attention", text: "The product was found, but it has no price." },
  currency_changed: { status: "needs_attention", text: "The page now shows prices in a different currency." },

  // Not an error
  out_of_stock: { status: "out_of_stock", text: "The product is out of stock." },
  ok: { status: "ok", text: "Price checked." },
} as const satisfies Record<string, { status: ListingStatus; text: string }>;

export type ReasonCode = keyof typeof REASONS;

export class CheckError extends Error {
  constructor(
    public readonly reason: ReasonCode,
    public readonly detail?: string,
    public readonly httpStatus?: number,
  ) {
    super(detail ? `${REASONS[reason].text} (${detail})` : REASONS[reason].text);
  }
  get status(): ListingStatus {
    return REASONS[this.reason].status;
  }
}

export function reasonText(code: string | null | undefined): string | null {
  if (!code) return null;
  return (REASONS as Record<string, { text: string }>)[code]?.text ?? code;
}
