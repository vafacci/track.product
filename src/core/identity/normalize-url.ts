/** Query parameters that never change which product a page shows. */
const TRACKING_PARAMS = [
  /^utm_/i,
  /^(gclid|gbraid|wbraid|dclid|fbclid|msclkid|yclid|ttclid|twclid|igshid|srsltid)$/i,
  /^(gad_source|gad_campaignid|_ga|_gl|mc_cid|mc_eid|ref|ref_|referrer|source|cid|affid|aff_id|affiliate|clickid|partner|campaign|trk|tracking|sc_cid|cmp|cmpid|icid|ecid|s_kwcid|ranmid|ranEAID|ranSiteID|zanpid|awc|sv1|sv_campaign_id)$/i,
];

function isTracking(key: string): boolean {
  return TRACKING_PARAMS.some((r) => r.test(key));
}

/**
 * Canonical form used to compare URLs: lower-case host without "www.",
 * no fragment, no tracking params, sorted query, no trailing slash, lower-case path.
 * Returns null for invalid URLs.
 */
export function normalizeUrl(input: string): string | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;

  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  let path = decodeURIComponentSafe(u.pathname).toLowerCase().replace(/\/{2,}/g, "/");
  path = path.replace(/\/(index\.html?)?$/, "") || "/";

  const params = [...u.searchParams.entries()]
    .filter(([k]) => !isTracking(k))
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  const query = params.length
    ? "?" + params.map(([k, v]) => `${k}=${v}`).join("&")
    : "";

  return `https://${host}${path}${query}`;
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Registrable-ish domain for display and rate limiting, e.g. "dell.com". */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Strip tracking params but otherwise keep the URL as the user gave it. */
export function cleanUrl(input: string): string {
  const u = new URL(input.trim());
  for (const k of [...u.searchParams.keys()]) if (isTracking(k)) u.searchParams.delete(k);
  u.hash = "";
  return u.toString();
}

export function sameUrl(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const na = normalizeUrl(a);
  return na !== null && na === normalizeUrl(b);
}
