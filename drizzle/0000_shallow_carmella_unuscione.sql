CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`company` text NOT NULL,
	`website` text DEFAULT '' NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`industry` text DEFAULT '' NOT NULL,
	`contact_name` text DEFAULT '' NOT NULL,
	`contact_role` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`offer` text DEFAULT 'ORGA HRMS' NOT NULL,
	`source` text DEFAULT 'Manual' NOT NULL,
	`source_url` text DEFAULT '' NOT NULL,
	`fit_reason` text DEFAULT '' NOT NULL,
	`stage` text DEFAULT 'Sourced' NOT NULL,
	`owner` text DEFAULT '' NOT NULL,
	`next_follow_up` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_leads_stage` ON `leads` (`stage`);--> statement-breakpoint
CREATE INDEX `idx_leads_follow_up` ON `leads` (`next_follow_up`);