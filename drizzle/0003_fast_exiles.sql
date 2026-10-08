CREATE TABLE `workspace_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`office_name` text DEFAULT 'Ithums Galleria Alpha 2, Greater Noida' NOT NULL,
	`office_latitude` text DEFAULT '' NOT NULL,
	`office_longitude` text DEFAULT '' NOT NULL,
	`google_ads_account_id` text DEFAULT '' NOT NULL,
	`google_ads_opt_in` integer DEFAULT 0 NOT NULL,
	`meta_business_id` text DEFAULT '' NOT NULL,
	`meta_page_id` text DEFAULT '' NOT NULL,
	`meta_opt_in` integer DEFAULT 0 NOT NULL
);
