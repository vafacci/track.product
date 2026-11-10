import type { FetchMode } from "@/db/schema";
import { analyzePage, failure, type AnalyzeOptions, type AnalyzeResult } from "./analyze";
import { browserEnabled, fetchPage } from "./fetch";
import { CheckError } from "./reasons";

export interface AnalyzeUrlOptions extends AnalyzeOptions {
  /** Start with the browser (the listing is known to need it). */
  mode?: FetchMode;
}

/** Reasons where a real browser might see something a plain HTTP fetch doesn't. */
const TRY_BROWSER = new Set(["blocked", "gemini_unavailable", "no_product_data", "no_price", "http_error"]);

async function attempt(url: string, mode: FetchMode, opts: AnalyzeOptions): Promise<AnalyzeResult> {
  try {
    return await analyzePage(await fetchPage(url, mode), opts);
  } catch (e) {
    if (e instanceof CheckError) return { ...failure(e), fetchMode: mode };
    throw e;
  }
}

/**
 * Fetch + analyze a URL with escalating effort:
 * 1. plain HTTP, structured data only (cheap, no AI)
 * 2. real browser if blocked or nothing found (JavaScript-rendered shops)
 * 3. AI fallback on the best page we got
 */
export async function analyzeUrl(url: string, opts: AnalyzeUrlOptions): Promise<AnalyzeResult> {
  const { mode = "http", llm, ...rest } = opts;
  const canBrowse = browserEnabled();

  if (mode === "http") {
    const first = await attempt(url, "http", { ...rest, llm: null });
    if (first.ok || !TRY_BROWSER.has(first.reason)) return first;

    if (canBrowse) {
      const second = await attempt(url, "browser", { ...rest, llm });
      // Prefer the browser's answer unless it failed for a purely technical reason.
      if (second.ok || second.status !== "error") return second;
    }
    // No browser (or it failed): let the AI look at the HTTP version.
    if (first.reason === "gemini_unavailable" && llm) return attempt(url, "http", { ...rest, llm });
    return first;
  }

  return attempt(url, "browser", { ...rest, llm });
}
