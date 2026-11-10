import type { Browser } from "playwright";
import { CheckError } from "@/core/reasons";
import { BROWSER_HEADERS } from "./http";
import type { FetchedPage } from "./types";

const g = globalThis as unknown as { __browser?: Promise<Browser> };

async function browser(): Promise<Browser> {
  if (!g.__browser) {
    g.__browser = import("playwright").then(({ chromium }) => chromium.launch({ headless: true }));
    g.__browser.catch(() => (g.__browser = undefined));
  }
  return g.__browser;
}

export async function closeBrowser(): Promise<void> {
  if (g.__browser) {
    const b = await g.__browser.catch(() => null);
    g.__browser = undefined;
    await b?.close();
  }
}

/** Fetch with a real (headless) browser, for JavaScript-rendered or bot-protected pages. */
export async function fetchBrowser(url: string): Promise<FetchedPage> {
  let b: Browser;
  try {
    b = await browser();
  } catch (e) {
    throw new CheckError("network_error", `could not start the browser: ${(e as Error).message.split("\n")[0]}`);
  }
  const context = await b.newContext({
    userAgent: BROWSER_HEADERS["User-Agent"],
    locale: "en-GB",
    extraHTTPHeaders: { "Accept-Language": BROWSER_HEADERS["Accept-Language"] },
    viewport: { width: 1366, height: 900 },
  });
  try {
    const page = await context.newPage();
    // Skip heavy assets; we only need the HTML and the scripts that build it.
    await page.route("**/*", (route) =>
      ["image", "media", "font"].includes(route.request().resourceType()) ? route.abort() : route.continue(),
    );
    let response;
    try {
      response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    } catch (e) {
      if (/timeout/i.test((e as Error).message)) throw new CheckError("timeout");
      throw new CheckError("network_error", (e as Error).message.split("\n")[0]);
    }

    // HTTP redirects of the main request, then any JavaScript navigation after it.
    const chain: string[] = [];
    for (let r = response?.request() ?? null; r; r = r.redirectedFrom()) chain.unshift(r.url());
    if (!chain.length) chain.push(url);
    const finalUrl = page.url();
    if (chain[chain.length - 1] !== finalUrl) chain.push(finalUrl);

    const status = response?.status() ?? 200;
    if (status === 403 || status === 429 || status === 503) throw new CheckError("blocked", `HTTP ${status}`, status);
    if (status >= 400 && status !== 404 && status !== 410) throw new CheckError("http_error", `HTTP ${status}`, status);

    return { requestedUrl: url, finalUrl, redirectChain: chain, status, html: await page.content(), mode: "browser" };
  } finally {
    await context.close();
  }
}
