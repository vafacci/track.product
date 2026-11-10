// Dev tool: fetch a URL and save the HTML, e.g. to create test fixtures.
// Usage: npx tsx scripts/fetch-page.ts <url> <out.html> [--browser]
import fs from "node:fs";
import { fetchHttp } from "@/core/fetch/http";

async function main() {
  const [url, out] = process.argv.slice(2);
  const page = await fetchHttp(url);
  console.log({ status: page.status, finalUrl: page.finalUrl, chain: page.redirectChain, bytes: page.html.length });
  if (out) fs.writeFileSync(out, page.html);
}
main().catch((e) => console.error("ERROR", e.reason ?? "", e.message));
