CREATE TABLE `alert_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`listing_id` integer,
	`rule_id` integer,
	`type` text NOT NULL,
	`old_price_base` integer,
	`new_price_base` integer NOT NULL,
	`base_currency` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`sent_at` integer,
	`error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`rule_id`) REFERENCES `alert_rules`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alert_events_dedupe_idx` ON `alert_events` (`dedupe_key`);--> statement-breakpoint
CREATE TABLE `alert_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`type` text NOT NULL,
	`value` real,
	`active` integer DEFAULT true NOT NULL,
	`last_alerted_price_base` integer,
	`armed` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `alert_rules_product_idx` ON `alert_rules` (`product_id`);--> statement-breakpoint
CREATE TABLE `check_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`listing_id` integer NOT NULL,
	`reason` text NOT NULL,
	`run_at` integer NOT NULL,
	`locked_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `check_jobs_run_at_idx` ON `check_jobs` (`run_at`);--> statement-breakpoint
CREATE TABLE `check_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`listing_id` integer NOT NULL,
	`status` text NOT NULL,
	`reason` text,
	`message` text,
	`http_status` integer,
	`final_url` text,
	`fetch_mode` text,
	`duration_ms` integer,
	`checked_at` integer NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `check_logs_listing_time_idx` ON `check_logs` (`listing_id`,`checked_at`);--> statement-breakpoint
CREATE TABLE `fx_rates` (
	`date` text NOT NULL,
	`base` text NOT NULL,
	`quote` text NOT NULL,
	`rate` real NOT NULL,
	PRIMARY KEY(`date`, `base`, `quote`)
);
--> statement-breakpoint
CREATE TABLE `listings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`domain` text NOT NULL,
	`url` text NOT NULL,
	`canonical_url` text NOT NULL,
	`normalized_url` text NOT NULL,
	`last_final_url` text,
	`identity_title` text,
	`identity_brand` text,
	`identity_sku` text,
	`identity_mpn` text,
	`identity_gtin` text,
	`currency` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`status_reason` text,
	`error_message` text,
	`active` integer DEFAULT true NOT NULL,
	`fetch_mode` text DEFAULT 'http' NOT NULL,
	`shipping_cost_minor` integer,
	`current_price_minor` integer,
	`current_price_base` integer,
	`current_in_stock` integer,
	`last_checked_at` integer,
	`last_success_at` integer,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `listings_product_idx` ON `listings` (`product_id`);--> statement-breakpoint
CREATE TABLE `price_points` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`listing_id` integer NOT NULL,
	`price_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`price_base` integer,
	`base_currency` text NOT NULL,
	`in_stock` integer NOT NULL,
	`source` text NOT NULL,
	`checked_at` integer NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `price_points_listing_time_idx` ON `price_points` (`listing_id`,`checked_at`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`mpn` text,
	`gtin` text,
	`image_url` text,
	`baseline_price_base` integer,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
