CREATE TABLE `campaign_spend` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`campaign` text NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`amount` text NOT NULL,
	`period` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `territories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`state` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`area` text DEFAULT '' NOT NULL,
	`offer` text DEFAULT '' NOT NULL,
	`owner` text DEFAULT '' NOT NULL,
	`radius_km` integer DEFAULT 0 NOT NULL,
	`center_latitude` text DEFAULT '' NOT NULL,
	`center_longitude` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `leads` ADD `lead_type` text DEFAULT 'Prospect' NOT NULL;--> statement-breakpoint
ALTER TABLE `leads` ADD `source_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `leads` ADD `campaign` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `leads` ADD `consent_status` text DEFAULT 'Unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `leads` ADD `consent_note` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `leads` ADD `estimated_value` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `leads` ADD `won_value` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `leads` ADD `currency` text DEFAULT 'INR' NOT NULL;--> statement-breakpoint
ALTER TABLE `leads` ADD `first_response_at` integer DEFAULT 0 NOT NULL;