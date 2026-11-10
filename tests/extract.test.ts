import { describe, expect, it } from "vitest";
import { extractStructured } from "@/core/extract";
import { pageText } from "@/core/extract/clean-html";
import { DELL_FINAL, fixture } from "./helpers";

const run = (name: string, url = "https://shop.example/p/1") => extractStructured(fixture(name), url);

describe("structured extraction", () => {
  it("normal product page: reads JSON-LD", () => {
    const r = run("product-normal.html", "https://www.elshop.dk/skaerme/samsung-odyssey-g7-27-ls27dg702euxen");
    expect(r.source).toBe("jsonld");
    expect(r.product).toMatchObject({
      name: 'Samsung Odyssey G7 27" gaming-skærm',
      brand: "Samsung",
      mpn: "LS27DG702EUXEN",
      gtin: "8806095512345",
      price: 3499,
      currency: "DKK",
      inStock: true,
      image: "https://cdn.elshop.dk/img/ls27dg702.jpg",
    });
    expect(r.signals.canonicalUrl).toBe("https://www.elshop.dk/skaerme/samsung-odyssey-g7-27-ls27dg702euxen");
    expect(r.signals.jsonLdListPage).toBe(false); // a BreadcrumbList is not a product list
  });

  it("product page with recommendations: uses the main product, not related items", () => {
    const r = run("product-with-recommendations.html", "https://techstore.co.uk/p/alienware-aw2726dl");
    expect(r.ambiguous).toBeNull();
    expect(r.product?.mpn).toBe("AW2726DL");
    // 529.00 is cheaper but out of stock; 99.00 / 39.99 / 9.99 belong to other products.
    expect(r.product?.price).toBe(549.99);
    expect(r.product?.currency).toBe("GBP");
    expect(r.signals.jsonLdProductCount).toBe(1);
  });

  it("category page: list signals and no single product", () => {
    const r = run("category-page.html");
    expect(r.product).toBeNull();
    expect(r.signals.jsonLdListPage).toBe(true);
    expect(r.signals.jsonLdProductCount).toBe(0);
  });

  it("out of stock page", () => {
    const r = run("out-of-stock.html");
    expect(r.product).toMatchObject({ price: 2799, currency: "DKK", inStock: false, gtin: "4548736160123" });
  });

  it("no JSON-LD: falls back to meta tags", () => {
    const r = run("no-jsonld-meta.html", "https://gadgets.example/products/mx-master-4");
    expect(r.source).toBe("meta");
    expect(r.product).toMatchObject({
      price: 899,
      currency: "DKK",
      inStock: true,
      brand: "Logitech",
      sku: "910-007181",
      image: "https://gadgets.example/img/mx4.jpg",
    });
  });

  it("no JSON-LD: microdata, ignoring nested related products", () => {
    const r = run("no-jsonld-microdata.html");
    expect(r.source).toBe("microdata");
    expect(r.product).toMatchObject({
      name: "Bosch Serie 6 Dishwasher",
      brand: "Bosch",
      mpn: "SMS6ECI03E",
      gtin: "4242005312345",
      price: 5995,
      currency: "DKK",
      inStock: true,
    });
  });

  it("no structured data at all: nothing extracted (AI fallback decides later)", () => {
    const r = run("no-structured-data.html");
    expect(r.product).toBeNull();
    expect(r.ambiguous).toBeNull();
  });

  it("error page: detected from the heading", () => {
    const r = run("error-page.html");
    expect(r.product).toBeNull();
    expect(r.signals.errorMessage).toMatch(/not found/i);
  });

  it("real Dell redirect target (accessories page) has no product", () => {
    const r = run("dell-redirect-accessories.html", DELL_FINAL);
    expect(r.product).toBeNull();
    expect(r.signals.jsonLdProductCount).toBe(0);
    expect(r.signals.canonicalUrl).toBe("https://www.dell.com/en-gb/shop/accessories");
    expect(r.signals.ogType).toBe("website");
  });
});

describe("pageText (input for the AI fallback)", () => {
  it("drops navigation, footer and recommendation widgets", () => {
    const text = pageText(fixture("no-structured-data.html"));
    expect(text).toContain("449,95 kr.");
    expect(text).toContain("Philips Hue White Ambiance");
    expect(text).not.toContain("Hue Bridge"); // "Andre købte også"
    expect(text).not.toContain("Tilbud 199"); // nav
    expect(text).not.toContain("Fragt 49"); // footer
  });
});
