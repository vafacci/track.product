import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Money is always stored as integers in the currency's minor unit
 * (øre, pence, cents) to avoid floating point errors. See src/lib/money.ts.
 */

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

export const LISTING_STATUSES = [
  "pending", // added, never checked by the worker
  "ok",
  "out_of_stock",
  "needs_attention", // identity check failed (redirect, different product, …)
  "not_found", // 404 / page removed / redirected to category page
  "error", // temporary problem: timeout, blocked, network
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const PRICE_SOURCES = ["jsonld", "microdata", "meta", "gemini"] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export const ALERT_RULE_TYPES = ["any_drop", "target", "percent_drop"] as const;
export type AlertRuleType = (typeof ALERT_RULE_TYPES)[number];

export const FETCH_MODES = ["http", "browser"] as const;
export type FetchMode = (typeof FETCH_MODES)[number];

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  brand: text("brand"),
  mpn: text("mpn"),
  gtin: text("gtin"),
  imageUrl: text("image_url"),
  /** Lowest price (base currency, minor units) when the product was created. Used for % drop rules. */
  baselinePriceBase: integer("baseline_price_base"),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
});

export const alertRules = sqliteTable(
  "alert_rules",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    type: text("type", { enum: ALERT_RULE_TYPES }).notNull(),
    /** target: price in base currency minor units. percent_drop: percent (e.g. 20). any_drop: unused. */
    value: real("value"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    /**
     * Re-arm state, so the same alert is never sent twice:
     * - any_drop: lowest price we already alerted on (only alert below it)
     * - target/percent_drop: false after firing, true again once price goes back above the threshold
     */
    lastAlertedPriceBase: integer("last_alerted_price_base"),
    armed: integer("armed", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("alert_rules_product_idx").on(t.productId)],
);

export const listings = sqliteTable(
  "listings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    /** URL as pasted by the user. */
    url: text("url").notNull(),
    /** URL the page declared as canonical (or the final URL at creation). */
    canonicalUrl: text("canonical_url").notNull(),
    /** Normalized canonical URL used for comparisons (no tracking params, no fragment). */
    normalizedUrl: text("normalized_url").notNull(),
    lastFinalUrl: text("last_final_url"),

    // Identity captured when the listing was added. Checked on every price check.
    identityTitle: text("identity_title"),
    identityBrand: text("identity_brand"),
    identitySku: text("identity_sku"),
    identityMpn: text("identity_mpn"),
    identityGtin: text("identity_gtin"),

    currency: text("currency").notNull(),
    status: text("status", { enum: LISTING_STATUSES }).notNull().default("pending"),
    /** Machine-readable reason code, see src/core/reasons.ts. */
    statusReason: text("status_reason"),
    /** Human-readable explanation shown in the UI. */
    errorMessage: text("error_message"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    fetchMode: text("fetch_mode", { enum: FETCH_MODES }).notNull().default("http"),
    /** Reserved for later (shipping / duties). */
    shippingCostMinor: integer("shipping_cost_minor"),

    // Denormalized latest successful result, for fast overview queries.
    currentPriceMinor: integer("current_price_minor"),
    currentPriceBase: integer("current_price_base"),
    currentInStock: integer("current_in_stock", { mode: "boolean" }),

    lastCheckedAt: integer("last_checked_at", { mode: "timestamp_ms" }),
    lastSuccessAt: integer("last_success_at", { mode: "timestamp_ms" }),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("listings_product_idx").on(t.productId)],
);

export const pricePoints = sqliteTable(
  "price_points",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    listingId: integer("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    priceMinor: integer("price_minor").notNull(),
    currency: text("currency").notNull(),
    /** Price converted to base currency (minor units). Null if no FX rate was available. */
    priceBase: integer("price_base"),
    baseCurrency: text("base_currency").notNull(),
    inStock: integer("in_stock", { mode: "boolean" }).notNull(),
    source: text("source", { enum: PRICE_SOURCES }).notNull(),
    checkedAt: integer("checked_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("price_points_listing_time_idx").on(t.listingId, t.checkedAt)],
);

/** One row per check attempt, successful or not. Explains statuses in the UI. */
export const checkLogs = sqliteTable(
  "check_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    listingId: integer("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    status: text("status", { enum: LISTING_STATUSES }).notNull(),
    reason: text("reason"),
    message: text("message"),
    httpStatus: integer("http_status"),
    finalUrl: text("final_url"),
    fetchMode: text("fetch_mode", { enum: FETCH_MODES }),
    durationMs: integer("duration_ms"),
    checkedAt: integer("checked_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("check_logs_listing_time_idx").on(t.listingId, t.checkedAt)],
);

export const alertEvents = sqliteTable(
  "alert_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    listingId: integer("listing_id").references(() => listings.id, { onDelete: "set null" }),
    ruleId: integer("rule_id").references(() => alertRules.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    oldPriceBase: integer("old_price_base"),
    newPriceBase: integer("new_price_base").notNull(),
    baseCurrency: text("base_currency").notNull(),
    /** Unique per (rule, price) so a retry can never send the same alert twice. */
    dedupeKey: text("dedupe_key").notNull(),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("alert_events_dedupe_idx").on(t.dedupeKey)],
);

/** Daily FX rates: 1 unit of `base` = `rate` units of `quote`. */
export const fxRates = sqliteTable(
  "fx_rates",
  {
    date: text("date").notNull(),
    base: text("base").notNull(),
    quote: text("quote").notNull(),
    rate: real("rate").notNull(),
  },
  (t) => [primaryKey({ columns: [t.date, t.base, t.quote] })],
);

export const CHECK_JOB_REASONS = ["scheduled", "manual", "sanity_recheck"] as const;

export const checkJobs = sqliteTable(
  "check_jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    listingId: integer("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    reason: text("reason", { enum: CHECK_JOB_REASONS }).notNull(),
    runAt: integer("run_at", { mode: "timestamp_ms" }).notNull(),
    lockedAt: integer("locked_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("check_jobs_run_at_idx").on(t.runAt)],
);

export type Product = typeof products.$inferSelect;
export type Listing = typeof listings.$inferSelect;
export type PricePoint = typeof pricePoints.$inferSelect;
export type AlertRule = typeof alertRules.$inferSelect;
export type AlertEvent = typeof alertEvents.$inferSelect;
export type CheckLog = typeof checkLogs.$inferSelect;
export type CheckJob = typeof checkJobs.$inferSelect;
