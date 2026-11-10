import { describe, expect, it } from "vitest";
import { analyzePage } from "@/core/analyze";
import type { LlmClient } from "@/core/ai/gemini";
import { checkIdentity, compareProducts } from "@/core/identity/match";
import { DELL_FINAL, DELL_URL, page } from "./helpers";

/** Fake AI that must never be called. */
const noAi: LlmClient = {
  json: async () => {
    throw new Error("AI must not be called for this page");
  },
};
const fakeAi = (answer: unknown): LlmClient => ({ json: async () => answer as never });

describe("the real Dell case", () => {
  it("redirect to the accessories page is NOT FOUND, no price, and the AI is never asked", async () => {
    const r = await analyzePage(
      page("dell-redirect-accessories.html", {
        url: DELL_URL,
        finalUrl: DELL_FINAL,
        redirectChain: [DELL_URL, "https://www.dell.com/en-uk/shop/accessories?showMessage=1", DELL_FINAL],
      }),
      { llm: noAi },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe("not_found");
    expect(r.reason).toBe("redirected_elsewhere");
    expect(r.message).toMatch(/redirects to a different page/);
  });

  it("an \"Access Denied\" bot-protection page is reported as blocked, not as a missing product", async () => {
    const r = await analyzePage(
      { requestedUrl: DELL_URL, finalUrl: DELL_URL, redirectChain: [DELL_URL], status: 200, mode: "browser", html: "<html><head><title>Access Denied</title></head><body>You don't have permission</body></html>" },
      { llm: noAi },
    );
    expect(r).toMatchObject({ ok: false, status: "error", reason: "blocked" });
  });
});

describe("page classification", () => {
  it("normal product page is accepted", async () => {
    const url = "https://www.elshop.dk/skaerme/samsung-odyssey-g7-27-ls27dg702euxen";
    const r = await analyzePage(page("product-normal.html", { url }), { llm: noAi });
    expect(r).toMatchObject({ ok: true, status: "ok", source: "jsonld", product: { price: 3499, currency: "DKK" } });
  });

  it("tracking parameters in the pasted link don't count as a redirect", async () => {
    const url = "https://www.elshop.dk/skaerme/samsung-odyssey-g7-27-ls27dg702euxen?utm_source=newsletter";
    const r = await analyzePage(page("product-normal.html", { url }), { llm: noAi });
    expect(r.ok && r.warnings).toEqual([]);
  });

  it("page with recommended products: main price only", async () => {
    const url = "https://techstore.co.uk/p/alienware-aw2726dl";
    const r = await analyzePage(page("product-with-recommendations.html", { url }), { llm: noAi });
    expect(r).toMatchObject({ ok: true, product: { price: 549.99, currency: "GBP", mpn: "AW2726DL" } });
  });

  it("link that now lands on a category page is not found", async () => {
    const url = "https://techstore.co.uk/p/alienware-aw2726dl";
    const r = await analyzePage(
      page("category-page.html", { url, finalUrl: "https://techstore.co.uk/c/gaming-monitors" }),
      { llm: noAi },
    );
    expect(r).toMatchObject({ ok: false, status: "not_found", reason: "category_page" });
  });

  it("category page without redirect is also rejected", async () => {
    const r = await analyzePage(page("category-page.html", { url: "https://techstore.co.uk/c/gaming-monitors" }), {
      llm: noAi,
    });
    expect(r).toMatchObject({ ok: false, reason: "category_page" });
  });

  it("'page not found' page is rejected even with HTTP 200", async () => {
    const r = await analyzePage(page("error-page.html", { url: "https://techstore.co.uk/p/old" }), { llm: noAi });
    expect(r).toMatchObject({ ok: false, status: "not_found", reason: "error_page" });
  });

  it("HTTP 404 is not found", async () => {
    const r = await analyzePage(page("product-normal.html", { url: "https://x.dk/p", status: 404 }), { llm: noAi });
    expect(r).toMatchObject({ ok: false, reason: "http_404" });
  });

  it("out of stock is its own status", async () => {
    const r = await analyzePage(page("out-of-stock.html", { url: "https://lydbutikken.dk/sony-wh-1000xm6-sort" }), {
      llm: noAi,
    });
    expect(r).toMatchObject({ ok: true, status: "out_of_stock", product: { price: 2799, inStock: false } });
  });

  it("no JSON-LD: meta tags are enough", async () => {
    const r = await analyzePage(page("no-jsonld-meta.html", { url: "https://gadgets.example/products/mx-master-4" }), {
      llm: noAi,
    });
    expect(r).toMatchObject({ ok: true, source: "meta", product: { price: 899 } });
  });
});

describe("AI fallback (no structured data)", () => {
  const url = "https://lampebixen.dk/philips-hue-e27-2pak";
  const good = {
    pageType: "single_product",
    name: "Philips Hue White Ambiance E27 – 2-pak",
    brand: "Philips",
    mpn: null,
    sku: "929002468404",
    gtin: null,
    priceText: "449,95 kr.",
    price: 449.95,
    currency: "DKK",
    inStock: true,
  };

  it("accepts AI data that is verified against the page", async () => {
    const r = await analyzePage(page("no-structured-data.html", { url }), { llm: fakeAi(good) });
    expect(r).toMatchObject({ ok: true, source: "gemini", product: { price: 449.95, currency: "DKK", sku: "929002468404" } });
  });

  it("rejects an AI price that belongs to a recommended product", async () => {
    // "399,00 kr." is the Hue Bridge in "Andre købte også". That block is stripped
    // from the text the AI sees and is verified against, so the price is rejected.
    const r = await analyzePage(page("no-structured-data.html", { url }), {
      llm: fakeAi({ ...good, priceText: "399,00 kr.", price: 399 }),
    });
    expect(r).toMatchObject({ ok: false, status: "needs_attention", reason: "no_price" });
  });

  it("rejects a hallucinated price", async () => {
    const r = await analyzePage(page("no-structured-data.html", { url }), {
      llm: fakeAi({ ...good, priceText: "429,00 kr.", price: 429 }),
    });
    expect(r).toMatchObject({ ok: false, status: "needs_attention", reason: "no_price" });
  });

  it("drops a hallucinated model number", async () => {
    const r = await analyzePage(page("no-structured-data.html", { url }), {
      llm: fakeAi({ ...good, mpn: "8719514291157" }),
    });
    expect(r.ok && r.product.mpn).toBeNull();
  });

  it("AI says it's a product list -> category page", async () => {
    const r = await analyzePage(page("no-structured-data.html", { url }), {
      llm: fakeAi({ ...good, pageType: "product_list" }),
    });
    expect(r).toMatchObject({ ok: false, reason: "category_page" });
  });

  it("without Gemini configured, explains why there is no price", async () => {
    const r = await analyzePage(page("no-structured-data.html", { url }), { llm: null });
    expect(r).toMatchObject({ ok: false, reason: "gemini_unavailable" });
  });
});

describe("periodic identity check", () => {
  const url = "https://www.elshop.dk/skaerme/samsung-odyssey-g7-27-ls27dg702euxen";
  const expected = { title: "Samsung Odyssey G7", brand: "Samsung", mpn: "LS27DG702EUXEN", sku: "EL-998877", gtin: "8806095512345" };

  it("same product passes", async () => {
    const r = await analyzePage(page("product-normal.html", { url }), {
      llm: noAi,
      expected,
      expectedCurrency: "DKK",
      knownUrls: [url],
      strictUrl: true,
    });
    expect(r.ok).toBe(true);
  });

  it("different EAN on the page -> needs attention, no price", async () => {
    const r = await analyzePage(page("product-normal.html", { url }), {
      llm: noAi,
      expected: { ...expected, gtin: "8806095599999" },
      knownUrls: [url],
      strictUrl: true,
    });
    expect(r).toMatchObject({ ok: false, status: "needs_attention", reason: "identity_mismatch" });
  });

  it("final URL differs from the saved one -> needs attention", async () => {
    const r = await analyzePage(page("product-normal.html", { url, finalUrl: "https://www.elshop.dk/kampagne/black-friday" }), {
      llm: noAi,
      expected,
      knownUrls: ["https://www.elshop.dk/skaerme/some-other-saved-url"],
      strictUrl: true,
    });
    expect(r).toMatchObject({ ok: false, status: "needs_attention", reason: "url_changed" });
  });

  it("currency changed -> needs attention", async () => {
    const r = await analyzePage(page("product-normal.html", { url }), { llm: noAi, expected, expectedCurrency: "EUR" });
    expect(r).toMatchObject({ ok: false, reason: "currency_changed" });
  });

  it("identifiers missing from the page -> identity_missing", () => {
    expect(checkIdentity(expected, { title: "Samsung Odyssey G7", brand: "Samsung", mpn: null, sku: null, gtin: null })).toMatchObject({
      ok: false,
      reason: "identity_missing",
    });
  });
});

describe("compareProducts (adding a link to an existing product)", () => {
  const base = { title: "Alienware 27 280Hz QD-OLED Gaming Monitor", brand: "Alienware", mpn: "AW2726DL", sku: null, gtin: null };
  it("same model number -> same", () => {
    expect(compareProducts(base, { ...base, title: "Alienware AW2726DL skærm", sku: "EL-1" }).verdict).toBe("same");
  });
  it("model number in the other title -> same", () => {
    expect(compareProducts(base, { title: "Alienware AW2726DL 27\" OLED", brand: null, mpn: null, sku: "123", gtin: null }).verdict).toBe(
      "same",
    );
  });
  it("different EAN -> different", () => {
    expect(compareProducts({ ...base, gtin: "5397184999999" }, { ...base, gtin: "5397184888888" }).verdict).toBe("different");
  });
  it("similar titles, no identifiers -> unsure", () => {
    expect(
      compareProducts(
        { title: "Alienware 27 Gaming Monitor", brand: "Alienware", mpn: null, sku: null, gtin: null },
        { title: "Alienware 27 inch gaming monitor 280Hz", brand: "Alienware", mpn: null, sku: null, gtin: null },
      ).verdict,
    ).toBe("unsure");
  });
});
