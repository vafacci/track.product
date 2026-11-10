/** Number of minor-unit digits for a currency (DKK 2, JPY 0, …). */
export function fractionDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export function toMinor(amount: number, currency: string): number {
  return Math.round(amount * 10 ** fractionDigits(currency));
}

export function fromMinor(minor: number, currency: string): number {
  return minor / 10 ** fractionDigits(currency);
}

export function formatMoney(minor: number | null | undefined, currency: string): string {
  if (minor === null || minor === undefined) return "–";
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(
      fromMinor(minor, currency),
    );
  } catch {
    return `${fromMinor(minor, currency).toFixed(2)} ${currency}`;
  }
}

/**
 * Parse a price written by a shop: "1.299,00 kr.", "£1,299.99", "1 299", 1299.
 * Returns the amount in major units, or null if it isn't clearly a price.
 */
export function parsePrice(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) && input >= 0 ? input : null;
  if (typeof input !== "string") return null;
  // Strip currency text and stray separators at the ends ("kr.", ",-").
  let s = input.replace(/[^\d.,]/g, "").replace(/^[.,]+|[.,]+$/g, "");
  if (!/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // Whichever separator comes last is the decimal separator.
    const dec = lastDot > lastComma ? "." : ",";
    const thou = dec === "." ? "," : ".";
    s = s.split(thou).join("").replace(dec, ".");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = s.split(sep);
    const tail = parts[parts.length - 1];
    // "1.299" / "1,299" with exactly 3 trailing digits = thousands separator.
    if (parts.length > 2 || tail.length === 3) s = parts.join("");
    else s = parts.slice(0, -1).join("") + "." + tail;
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
