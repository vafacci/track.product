import { describe, expect, it } from "vitest";
import { formatMoney, parsePrice, toMinor } from "@/lib/money";

describe("parsePrice", () => {
  it.each([
    ["1.299,00 kr.", 1299],
    ["£1,299.99", 1299.99],
    ["1 299,-", 1299],
    ["499.95", 499.95],
    ["2.499", 2499],
    ["12,5", 12.5],
    [349, 349],
  ])("%s -> %s", (input, expected) => {
    expect(parsePrice(input)).toBe(expected);
  });

  it("rejects non-prices", () => {
    expect(parsePrice("call for price")).toBeNull();
    expect(parsePrice(undefined)).toBeNull();
    expect(parsePrice(-5)).toBeNull();
  });
});

describe("minor units", () => {
  it("handles currencies with and without decimals", () => {
    expect(toMinor(1299.99, "GBP")).toBe(129999);
    expect(toMinor(1500, "JPY")).toBe(1500);
    expect(formatMoney(129999, "GBP")).toBe("£1,299.99");
  });
});
