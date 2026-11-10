import type { FetchMode } from "@/db/schema";
import { env } from "@/lib/env";
import { fetchBrowser } from "./browser";
import { fetchHttp } from "./http";
import type { FetchedPage } from "./types";

export type { FetchedPage } from "./types";
export { closeBrowser } from "./browser";

export function browserEnabled(): boolean {
  return env().PLAYWRIGHT_ENABLED;
}

export async function fetchPage(url: string, mode: FetchMode = "http"): Promise<FetchedPage> {
  return mode === "browser" ? fetchBrowser(url) : fetchHttp(url);
}
