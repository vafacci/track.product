import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/db/client";
import { productSummary } from "@/core/queries";
import { reasonText } from "@/core/reasons";
import { StatusBadge } from "@/components/status-badge";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/money";

export default function ProductPage({ params }: PageProps<"/products/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm opacity-60">Loading…</p>}>
      <ProductDetails params={params} />
    </Suspense>
  );
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

async function ProductDetails({ params }: { params: PageProps<"/products/[id]">["params"] }) {
  await connection();
  const { id } = await params;
  const summary = productSummary(db(), Number(id));
  if (!summary) notFound();
  const { product: p, listings, best } = summary;
  const base = env().BASE_CURRENCY;

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm opacity-70 hover:opacity-100">
        ← All products
      </Link>

      <div className="flex gap-4">
        {p.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrl} alt="" className="h-28 w-28 shrink-0 rounded-xl bg-white object-contain" />
        )}
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-semibold sm:text-2xl">{p.name}</h1>
          <p className="text-sm opacity-70">
            {[p.brand, p.mpn && `Model ${p.mpn}`, p.gtin && `EAN ${p.gtin}`].filter(Boolean).join(" · ")}
          </p>
          {best ? (
            <p>
              <span className="text-2xl font-semibold">{formatMoney(best.currentPriceBase, base)}</span>
              <span className="text-sm opacity-70"> lowest now, at {best.domain}</span>
            </p>
          ) : (
            <p className="text-sm opacity-70">No current price from any shop.</p>
          )}
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Shops</h2>
          <Link
            href={`/add?product=${p.id}`}
            className="rounded-lg border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            + Add another shop
          </Link>
        </div>
        <ul className="space-y-3">
          {listings.map((l) => {
            const explanation = l.status !== "ok" && l.status !== "pending" ? (l.errorMessage ?? reasonText(l.statusReason)) : null;
            return (
              <li key={l.id} className="space-y-2 rounded-xl border border-black/10 p-4 dark:border-white/15">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{l.domain}</p>
                    <a href={l.url} target="_blank" rel="noreferrer" className="block truncate text-xs underline opacity-60">
                      {l.url}
                    </a>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold">{formatMoney(l.currentPriceMinor, l.currency)}</p>
                    {l.currency !== base && l.currentPriceBase !== null && (
                      <p className="text-xs opacity-60">≈ {formatMoney(l.currentPriceBase, base)}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <StatusBadge status={l.status} />
                  {l.lastCheckedAt && <span className="opacity-60">Checked {dateFmt.format(l.lastCheckedAt)}</span>}
                  {l.fetchMode === "browser" && <span className="opacity-60">· needs a real browser</span>}
                </div>
                {explanation && (
                  <p className="rounded-lg bg-black/5 p-2 text-sm dark:bg-white/10">
                    {explanation}
                    {l.status !== "ok" && l.currentPriceMinor !== null && (
                      <span className="block text-xs opacity-70">
                        The price shown is the last verified price, from {l.lastSuccessAt ? dateFmt.format(l.lastSuccessAt) : "earlier"}.
                      </span>
                    )}
                  </p>
                )}
                {(l.identityMpn || l.identitySku || l.identityGtin) && (
                  <p className="text-xs opacity-60">
                    Verified by {[l.identityMpn && `model ${l.identityMpn}`, l.identitySku && `SKU ${l.identitySku}`, l.identityGtin && `EAN ${l.identityGtin}`]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <p className="text-xs opacity-60">
        Price history chart, alert rules and &ldquo;Check now&rdquo; arrive in the next build steps.
      </p>
    </div>
  );
}
