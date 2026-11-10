import { Suspense } from "react";
import { connection } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { AddLinkForm } from "./add-link-form";

export default function AddPage({ searchParams }: PageProps<"/add">) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Add a link</h1>
        <p className="mt-1 text-sm opacity-70">
          Paste a product page from any shop. We check that it really is a single product before tracking it.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm opacity-60">Loading…</p>}>
        <Form searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/add">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const preselect = Number(Array.isArray(sp.product) ? sp.product[0] : sp.product) || null;
  const products = db()
    .select({ id: schema.products.id, name: schema.products.name })
    .from(schema.products)
    .where(eq(schema.products.archived, false))
    .orderBy(asc(schema.products.name))
    .all();
  return <AddLinkForm products={products} preselectProductId={preselect} />;
}
