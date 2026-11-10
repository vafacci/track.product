import { and, desc, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { fxRates } from "@/db/schema";
import { env } from "@/lib/env";
import { fromMinor, toMinor } from "@/lib/money";

const today = () => new Date().toISOString().slice(0, 10);

/** Fetch today's ECB-based rates for the base currency (once per day) and store them. */
export async function refreshRates(db: DB, base = env().BASE_CURRENCY): Promise<boolean> {
  const date = today();
  const existing = db.select().from(fxRates).where(and(eq(fxRates.base, base), eq(fxRates.date, date))).limit(1).all();
  if (existing.length) return true;
  try {
    const res = await fetch(`${env().FX_API_URL}/latest?base=${base}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return false;
    const data = (await res.json()) as { rates: Record<string, number> };
    const rows = Object.entries(data.rates).map(([quote, rate]) => ({ date, base, quote, rate }));
    if (rows.length) db.insert(fxRates).values(rows).onConflictDoNothing().run();
    return rows.length > 0;
  } catch {
    return false;
  }
}

/** Units of `currency` per 1 unit of base, from the most recent stored day. */
function rateFor(db: DB, currency: string, base: string): number | null {
  const row = db
    .select({ rate: fxRates.rate })
    .from(fxRates)
    .where(and(eq(fxRates.base, base), eq(fxRates.quote, currency)))
    .orderBy(desc(fxRates.date))
    .limit(1)
    .get();
  return row?.rate ?? null;
}

/** Convert a minor-unit amount to the base currency (minor units). Null if no rate is known. */
export function convertToBase(db: DB, minor: number, currency: string, base = env().BASE_CURRENCY): number | null {
  if (currency === base) return minor;
  const rate = rateFor(db, currency, base);
  if (!rate) return null;
  return toMinor(fromMinor(minor, currency) / rate, base);
}
