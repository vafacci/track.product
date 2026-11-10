import { Suspense } from "react";
import { connection } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
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
  const products = db()
    .select()
    .from(schema.products)
    .where(eq(schema.products.archived, false))
    .orderBy(desc(schema.products.createdAt))
    .all();

  if (products.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-black/20 p-10 text-center dark:border-white/20">
        <p className="font-medium">No products yet</p>
        <p className="mt-1 text-sm opacity-70">
          Adding links arrives in a later build step. The database is connected and ready.
        </p>
      </div>
    );
  }

  const base = env().BASE_CURRENCY;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {products.map((p) => (
        <li key={p.id} className="rounded-xl border border-black/10 p-4 dark:border-white/10">
          <p className="font-medium">{p.name}</p>
          <p className="text-sm opacity-70">{formatMoney(p.baselinePriceBase, base)}</p>
        </li>
      ))}
    </ul>
  );
}
