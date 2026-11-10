import type { ListingStatus } from "@/db/schema";

const STYLES: Record<ListingStatus, { label: string; className: string }> = {
  pending: { label: "Waiting for first check", className: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200" },
  ok: { label: "OK", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" },
  out_of_stock: { label: "Out of stock", className: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  needs_attention: { label: "Needs attention", className: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200" },
  not_found: { label: "Not found", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" },
  error: { label: "Temporary error", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200" },
};

export function StatusBadge({ status }: { status: ListingStatus }) {
  const s = STYLES[status];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>{s.label}</span>;
}

export const NEEDS_USER: ListingStatus[] = ["needs_attention", "not_found"];
