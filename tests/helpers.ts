import fs from "node:fs";
import path from "node:path";
import type { FetchedPage } from "@/core/fetch/types";

export function fixture(name: string): string {
  return fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
}

export function page(name: string, opts: Partial<FetchedPage> & { url: string }): FetchedPage {
  const { url, ...rest } = opts;
  return {
    requestedUrl: url,
    finalUrl: url,
    redirectChain: [url],
    status: 200,
    html: fixture(name),
    mode: "http",
    ...rest,
  };
}

export const DELL_URL =
  "https://www.dell.com/en-gb/shop/monitors/apd/alienware-27-280hz-gaming-monitor-aw2726dl/aw2726dl";
export const DELL_FINAL = "https://www.dell.com/en-gb/shop/accessories?showMessage=1";
