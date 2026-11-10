import { describe, expect, it } from "vitest";
import { normalizeUrl, sameUrl } from "@/core/identity/normalize-url";

describe("normalizeUrl", () => {
  it("removes tracking params, fragment, www and trailing slash", () => {
    expect(
      normalizeUrl("https://www.Shop.dk/p/Monitor-123/?utm_source=x&gclid=abc&color=black#reviews"),
    ).toBe("https://shop.dk/p/monitor-123?color=black");
  });

  it("sorts remaining query params", () => {
    expect(normalizeUrl("https://a.com/x?b=2&a=1")).toBe(normalizeUrl("https://a.com/x?a=1&b=2"));
  });

  it("treats a product page and a category page as different", () => {
    expect(
      sameUrl(
        "https://www.dell.com/en-gb/shop/monitors/apd/alienware-27-280hz-gaming-monitor-aw2726dl/aw2726dl",
        "https://www.dell.com/en-gb/shop/computer-monitors/ar/8605",
      ),
    ).toBe(false);
  });

  it("rejects non-http URLs", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
  });
});
