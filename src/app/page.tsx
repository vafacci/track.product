import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/db/client";
import { productSummaries } from "@/core/queries";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/money";

export default function Home() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Products</h1>
      <Suspense fallback={<p className="text-sm opacity-60">Loading…</p>}>
        <ProductList />
      </Suspense>
    </div>
  );
}

async function ProductList() {
  await connection(); // read the database per request, never at build time
  const items = productSummaries(db());
  const base = env().BASE_CURRENCY;

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-black/20 p-10 text-center dark:border-white/20">
        <p className="font-medium">No products yet</p>
        <p className="mt-1 text-sm opacity-70">Paste a link to a product page to start tracking its price.</p>
        <Link href="/add" className="mt-4 inline-block rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background">
          + Add link
        </Link>
      </div>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(({ product: p, listings, best, attention }) => (
        <li key={p.id}>
          <Link
            href={`/products/${p.id}`}
            className="flex h-full gap-3 rounded-xl border border-black/10 p-3 hover:border-black/30 dark:border-white/15 dark:hover:border-white/40"
          >
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.imageUrl} alt="" className="h-20 w-20 shrink-0 rounded-lg bg-white object-contain" />
            ) : (
              <div className="h-20 w-20 shrink-0 rounded-lg bg-black/5 dark:bg-white/10" />
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="line-clamp-2 text-sm font-medium">{p.name}</p>
              {best ? (
                <p>
                  <span className="text-lg font-semibold">{formatMoney(best.currentPriceBase, base)}</span>
                  <span className="text-xs opacity-60"> at {best.domain}</span>
                </p>
              ) : (
                <p className="text-sm opacity-60">No current price</p>
              )}
              <p className="text-xs opacity-60">
                {listings.length} {listings.length === 1 ? "shop" : "shops"}
              </p>
              {attention.length > 0 && (
                <p className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                  ⚠ {attention.length} {attention.length === 1 ? "link needs" : "links need"} attention
                </p>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
