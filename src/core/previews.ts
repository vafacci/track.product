import type { AnalyzeSuccess } from "./analyze";

/**
 * Short-lived store for "Is this the product?" previews, so the data the user
 * confirms is exactly the data the server verified (and the page isn't fetched twice).
 */
export interface Preview {
  id: string;
  inputUrl: string;
  result: AnalyzeSuccess;
  createdAt: number;
}

const TTL_MS = 30 * 60 * 1000;
const g = globalThis as unknown as { __previews?: Map<string, Preview> };
const store = (g.__previews ??= new Map());

export function savePreview(inputUrl: string, result: AnalyzeSuccess): Preview {
  const now = Date.now();
  for (const [k, v] of store) if (now - v.createdAt > TTL_MS) store.delete(k);
  const preview = { id: crypto.randomUUID(), inputUrl, result, createdAt: now };
  store.set(preview.id, preview);
  return preview;
}

export function getPreview(id: string): Preview | null {
  const p = store.get(id);
  if (!p || Date.now() - p.createdAt > TTL_MS) return null;
  return p;
}

export function deletePreview(id: string): void {
  store.delete(id);
}
