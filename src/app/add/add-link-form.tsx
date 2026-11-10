"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AnalyzeFailure, AnalyzeSuccess } from "@/core/analyze";
import type { ProductMatch } from "@/core/listings";
import { StatusBadge } from "@/components/status-badge";
import { formatMoney, toMinor } from "@/lib/money";

type PreviewResponse = AnalyzeSuccess & { previewId: string; matches: ProductMatch[] };
type ErrorResponse = (AnalyzeFailure | { ok: false; reason?: "duplicate"; message: string; productId?: number }) & {
  detail?: string;
};
type Compare = { verdict: "same" | "different" | "unsure"; reason: string; ai: { verdict: string; reason: string } | null };

const SOURCE_LABEL: Record<string, string> = {
  jsonld: "structured product data",
  microdata: "structured product data",
  meta: "page meta tags",
  gemini: "AI (verified against the page)",
};

export function AddLinkForm({
  products,
  preselectProductId,
}: {
  products: { id: number; name: string }[];
  preselectProductId: number | null;
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorResponse | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mode, setMode] = useState<"new" | "existing">(preselectProductId ? "existing" : "new");
  const [name, setName] = useState("");
  const [productId, setProductId] = useState<number | null>(preselectProductId);
  const [compare, setCompare] = useState<Compare | null>(null);
  const [comparing, setComparing] = useState(false);
  const [saving, setSaving] = useState(false);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setPreview(null);
    setCompare(null);
    try {
      const res = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!data.ok) return setError(data);
      setPreview(data);
      setName(data.product.name ?? "");
      const sure = data.matches.find((m: ProductMatch) => m.verdict === "same");
      if (preselectProductId) void pickProduct(preselectProductId, data.previewId);
      else if (sure) {
        setMode("existing");
        void pickProduct(sure.productId, data.previewId);
      }
    } catch {
      setError({ ok: false, message: "Something went wrong. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  async function pickProduct(id: number, previewId = preview?.previewId) {
    setProductId(id);
    setCompare(null);
    if (!previewId) return;
    setComparing(true);
    try {
      const res = await fetch(`/api/preview/${previewId}/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: id }),
      });
      if (res.ok) setCompare(await res.json());
    } finally {
      setComparing(false);
    }
  }

  async function save() {
    if (!preview) return;
    setSaving(true);
    const res = await fetch("/api/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        mode === "existing" && productId
          ? { previewId: preview.previewId, productId }
          : { previewId: preview.previewId, newProductName: name },
      ),
    });
    const data = await res.json();
    if (!res.ok) {
      setSaving(false);
      return setError({ ok: false, message: data.message });
    }
    router.push(`/products/${data.productId}`);
    router.refresh();
  }

  const p = preview?.product;
  const currency = p?.currency ?? "DKK";

  return (
    <div className="space-y-6">
      <form onSubmit={check} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          required
          inputMode="url"
          placeholder="https://shop.example/product/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-black/15 bg-transparent px-3 py-2 dark:border-white/20"
        />
        <button
          disabled={loading}
          className="rounded-lg bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
        >
          {loading ? "Checking…" : "Check link"}
        </button>
      </form>

      {loading && (
        <p className="text-sm opacity-70">
          Fetching and verifying the page. If the shop needs a real browser or AI, this can take up to a minute.
        </p>
      )}

      {error && (
        <div className="space-y-2 rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
          <div className="flex flex-wrap items-center gap-2">
            {"status" in error && <StatusBadge status={error.status} />}
            <p className="font-medium">{error.message}</p>
          </div>
          {error.detail && <p className="text-sm opacity-80">Details: {error.detail}</p>}
          {"redirectChain" in error && error.redirectChain && error.redirectChain.length > 1 && (
            <div className="text-sm">
              <p className="opacity-80">The link went through these pages:</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5 break-all opacity-80">
                {error.redirectChain.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ol>
            </div>
          )}
          {"reason" in error && error.reason && (
            <p className="text-xs opacity-60">
              Code: {error.reason}
              {"httpStatus" in error && error.httpStatus ? ` · HTTP ${error.httpStatus}` : ""}
              {"fetchMode" in error && error.fetchMode ? ` · fetched with ${error.fetchMode}` : ""}
            </p>
          )}
          {"productId" in error && error.productId && (
            <a href={`/products/${error.productId}`} className="text-sm underline">
              Go to the product
            </a>
          )}
        </div>
      )}

      {preview && p && (
        <div className="space-y-5 rounded-xl border border-black/10 p-4 dark:border-white/15">
          <h2 className="text-lg font-semibold">Is this the product?</h2>
          <div className="flex gap-4">
            {p.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image} alt="" className="h-24 w-24 shrink-0 rounded-lg bg-white object-contain" />
            )}
            <div className="min-w-0 space-y-1">
              <p className="font-medium">{p.name}</p>
              <p className="text-2xl font-semibold">
                {p.price !== null ? formatMoney(toMinor(p.price, currency), currency) : "No price"}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <StatusBadge status={preview.status} />
                <span className="opacity-70">{new URL(preview.finalUrl).hostname.replace(/^www\./, "")}</span>
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="opacity-60">Brand</dt>
            <dd>{p.brand ?? "–"}</dd>
            <dt className="opacity-60">Model no.</dt>
            <dd className="break-all">{p.mpn ?? "–"}</dd>
            <dt className="opacity-60">SKU</dt>
            <dd className="break-all">{p.sku ?? "–"}</dd>
            <dt className="opacity-60">EAN</dt>
            <dd>{p.gtin ?? "–"}</dd>
            <dt className="opacity-60">Read from</dt>
            <dd>
              {SOURCE_LABEL[preview.source]} · {preview.fetchMode === "browser" ? "real browser" : "direct fetch"}
            </dd>
          </dl>

          {preview.warnings.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              {preview.warnings.map((w, i) => (
                <li key={i}>⚠ {w}</li>
              ))}
            </ul>
          )}

          <fieldset className="space-y-3">
            <legend className="mb-2 font-medium">Save as</legend>
            <label className="flex items-start gap-2">
              <input type="radio" checked={mode === "new"} onChange={() => setMode("new")} className="mt-1" />
              <span className="flex-1 space-y-2">
                <span>A new product</span>
                {mode === "new" && (
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="block w-full rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm dark:border-white/20"
                  />
                )}
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                checked={mode === "existing"}
                disabled={products.length === 0}
                onChange={() => setMode("existing")}
                className="mt-1"
              />
              <span className="flex-1 space-y-2">
                <span className={products.length === 0 ? "opacity-50" : ""}>
                  Another shop for an existing product{products.length === 0 && " (none yet)"}
                </span>
                {mode === "existing" && (
                  <select
                    value={productId ?? ""}
                    onChange={(e) => pickProduct(Number(e.target.value))}
                    className="block w-full rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm dark:border-white/20"
                  >
                    <option value="" disabled>
                      Choose product…
                    </option>
                    {preview.matches.length > 0 && (
                      <optgroup label="Suggested">
                        {preview.matches.map((m) => (
                          <option key={m.productId} value={m.productId}>
                            {m.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="All products">
                      {products.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                )}
              </span>
            </label>
          </fieldset>

          {mode === "existing" && comparing && <p className="text-sm opacity-70">Comparing products…</p>}
          {mode === "existing" && compare && <CompareResult compare={compare} />}

          <button
            onClick={save}
            disabled={saving || (mode === "existing" && !productId)}
            className="w-full rounded-lg bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50 sm:w-auto"
          >
            {saving ? "Saving…" : "Yes, track this product"}
          </button>
        </div>
      )}
    </div>
  );
}

function CompareResult({ compare }: { compare: Compare }) {
  const aiNo = compare.ai?.verdict === "no";
  const aiYes = compare.ai?.verdict === "yes";
  if (compare.verdict === "same")
    return (
      <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
        ✓ Looks like the same product. {compare.reason}
      </p>
    );
  if (compare.verdict === "different" || aiNo)
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        <p className="font-medium">⚠ This does not look like the same product.</p>
        <p>{compare.reason}</p>
        {compare.ai && <p className="mt-1">AI: {compare.ai.reason}</p>}
        <p className="mt-1 opacity-80">You can still save it, but prices may not be comparable.</p>
      </div>
    );
  return (
    <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <p className="font-medium">{aiYes ? "Probably the same product." : "Not sure this is the same product."}</p>
      <p>{compare.reason}</p>
      {compare.ai && <p className="mt-1">AI: {compare.ai.reason}</p>}
    </div>
  );
}
