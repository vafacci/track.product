import * as cheerio from "cheerio";

const NOISE = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "iframe",
  "canvas",
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[aria-hidden="true"]',
  // Recommendation widgets: their prices belong to other products.
  '[class*="recommend" i]',
  '[class*="carousel" i]',
  '[class*="related" i]',
  '[class*="cross-sell" i]',
  '[class*="upsell" i]',
  '[id*="recommend" i]',
  '[id*="related" i]',
].join(",");

/** Visible text of the page's main content, for the AI fallback. */
export function pageText(html: string, maxChars = 30_000): string {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim();
  const description = $('meta[name="description"]').attr("content")?.trim() ?? "";
  $(NOISE).remove();

  const root = $("main, [role=main], #main, #content").first();
  const scope = root.length ? root : $("body");
  scope.find("br, p, div, li, h1, h2, h3, h4, tr, section, article").each((_, el) => {
    $(el).append("\n");
  });
  const body = scope
    .text()
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

  return [`TITLE: ${title}`, description && `DESCRIPTION: ${description}`, body]
    .filter(Boolean)
    .join("\n")
    .slice(0, maxChars);
}
