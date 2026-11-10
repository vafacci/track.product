import { CheckError } from "@/core/reasons";
import type { FetchedPage } from "./types";

export const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9,da;q=0.8",
};

const MAX_REDIRECTS = 10;
const TIMEOUT_MS = 20_000;
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Plain HTTP fetch that follows redirects manually so we know every hop.
 * Throws CheckError for network/HTTP problems. 404/410 are returned (not thrown)
 * so the caller can classify the page; 403/429/503 are reported as "blocked".
 */
export async function fetchHttp(url: string): Promise<FetchedPage> {
  const chain = [url];
  let current = url;
  const cookies = new Map<string, string>();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      const headers: Record<string, string> = { ...BROWSER_HEADERS };
      if (cookies.size) headers.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
      res = await fetch(current, {
        redirect: "manual",
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      const name = (e as Error)?.name;
      if (name === "TimeoutError" || name === "AbortError") throw new CheckError("timeout");
      throw new CheckError("network_error", (e as Error)?.message);
    }

    // Some shops set a cookie on the first hop and require it on the next.
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      if (i > 0) cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, current).toString();
      chain.push(current);
      continue;
    }

    if (res.status === 403 || res.status === 429 || res.status === 503) {
      throw new CheckError("blocked", `HTTP ${res.status}`, res.status);
    }
    if (res.status >= 500 || (res.status >= 400 && res.status !== 404 && res.status !== 410)) {
      throw new CheckError("http_error", `HTTP ${res.status}`, res.status);
    }

    const type = res.headers.get("content-type") ?? "";
    if (type && !/html|xml/i.test(type)) throw new CheckError("not_html", type, res.status);

    const buf = await res.arrayBuffer();
    const html = new TextDecoder("utf-8").decode(buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf);
    return { requestedUrl: url, finalUrl: current, redirectChain: chain, status: res.status, html, mode: "http" };
  }
  throw new CheckError("too_many_redirects");
}
