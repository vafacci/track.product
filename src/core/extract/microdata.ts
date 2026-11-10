import type { CheerioAPI } from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { emptyProduct, type ProductData } from "./types";
import { absoluteUrl, availability, clean, currencyCode, structuredPrice } from "./util";

const PRODUCT_SCOPE = '[itemscope][itemtype*="schema.org/Product" i], [itemscope][itemtype*="schema.org/IndividualProduct" i]';

/**
 * schema.org microdata. Only top-level Product scopes count: a product
 * nested inside another product or inside an ItemList is a recommendation.
 */
export function extractMicrodata($: CheerioAPI, pageUrl: string): ProductData[] {
  const out: ProductData[] = [];
  $(PRODUCT_SCOPE).each((_, el) => {
    const $el = $(el);
    if ($el.parents(`${PRODUCT_SCOPE}, [itemtype*="schema.org/ItemList" i]`).length) return;

    // itemprops that belong directly to `scope` (not to a nested item, except offers/brand).
    const props = (scope: Element, name: string): string | null => {
      let value: string | null = null;
      $(scope)
        .find(`[itemprop~="${name}"]`)
        .each((_, p) => {
          if (value !== null) return;
          if (ownerScope($, p) !== scope) return;
          const $p = $(p);
          value = clean($p.attr("content") ?? $p.attr("href") ?? $p.attr("src") ?? $p.text());
        });
      return value;
    };

    const offerEl = $el.find('[itemprop~="offers"][itemscope]').filter((_, o) => ownerScope($, o) === el).first();
    const offer = offerEl.length ? (offerEl.get(0) as Element) : null;
    const brandEl = $el.find('[itemprop~="brand"][itemscope]').filter((_, b) => ownerScope($, b) === el).first();
    const brand = brandEl.length ? props(brandEl.get(0) as Element, "name") : props(el, "brand");

    out.push({
      ...emptyProduct(),
      name: props(el, "name"),
      brand,
      sku: props(el, "sku"),
      mpn: props(el, "mpn"),
      gtin: props(el, "gtin13") ?? props(el, "gtin") ?? props(el, "gtin12") ?? props(el, "gtin14"),
      image: absoluteUrl(props(el, "image"), pageUrl),
      price: structuredPrice(offer ? (props(offer, "price") ?? props(offer, "lowPrice")) : props(el, "price")),
      currency: currencyCode(offer ? props(offer, "priceCurrency") : props(el, "priceCurrency")),
      inStock: availability(offer ? props(offer, "availability") : props(el, "availability")),
    });
  });
  return out;
}

/** The itemscope element an itemprop belongs to. */
function ownerScope($: CheerioAPI, el: AnyNode): Element | null {
  const parent = $(el).parent().closest("[itemscope]");
  return parent.length ? (parent.get(0) as Element) : null;
}
