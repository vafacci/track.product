// Dev tool: shrink a saved page into a test fixture. Removes scripts (except
// JSON-LD), styles, SVGs and inline data, keeping everything extraction uses.
// Usage: npx tsx scripts/make-fixture.ts <in.html> <out.html>
import fs from "node:fs";
import * as cheerio from "cheerio";

const [input, output] = process.argv.slice(2);
const $ = cheerio.load(fs.readFileSync(input, "utf8"));
$('script:not([type="application/ld+json"]), style, svg, noscript, iframe, link[rel="stylesheet"], link[rel="preload"]').remove();
$("[style]").removeAttr("style");
$("*").each((_, el) => {
  for (const name of Object.keys((el as { attribs?: Record<string, string> }).attribs ?? {})) {
    if (name.startsWith("data-") || name === "srcset") $(el).removeAttr(name);
  }
});
const html = $.html().replace(/\n\s*\n+/g, "\n");
fs.writeFileSync(output, html);
console.log(`${input}: ${fs.statSync(input).size} -> ${html.length} bytes`);
