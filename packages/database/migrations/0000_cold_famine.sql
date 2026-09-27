CREATE TABLE `admins` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admins_username_unique` ON `admins` (`username`);--> statement-breakpoint
CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_prefix` text NOT NULL,
	`token_hash` text NOT NULL,
	`scopes` text NOT NULL,
	`expires_at` integer,
	`last_used_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_token_hash_unique` ON `api_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `api_tokens_active_idx` ON `api_tokens` (`revoked_at`,`expires_at`);--> statement-breakpoint
CREATE TABLE `managed_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`expires_at` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`lifecycle_status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `managed_clients_name_idx` ON `managed_clients` (`name`);--> statement-breakpoint
CREATE TABLE `nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`protocol` text NOT NULL,
	`host` text NOT NULL,
	`port` integer NOT NULL,
	`username_ciphertext` text NOT NULL,
	`password_ciphertext` text NOT NULL,
	`allow_insecure_tls` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'unreachable' NOT NULL,
	`detected_version` text,
	`mode` text,
	`last_checked_at` integer,
	`last_synced_at` integer,
	`last_error_code` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nodes_name_unique` ON `nodes` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `nodes_endpoint_unique` ON `nodes` (`protocol`,`host`,`port`);--> statement-breakpoint
CREATE TABLE `operation_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`placement_id` text,
	`operation` text NOT NULL,
	`status` text NOT NULL,
	`error_code` text,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`placement_id`) REFERENCES `placements`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `operation_attempts_placement_idx` ON `operation_attempts` (`placement_id`);--> statement-breakpoint
CREATE TABLE `placements` (
	`id` text PRIMARY KEY NOT NULL,
	`managed_client_id` text NOT NULL,
	`node_id` text NOT NULL,
	`remote_client_id` integer,
	`desired_payload` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`last_error_code` text,
	`last_attempt_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`managed_client_id`) REFERENCES `managed_clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `placements_managed_node_unique` ON `placements` (`managed_client_id`,`node_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `placements_remote_unique` ON `placements` (`node_id`,`remote_client_id`);--> statement-breakpoint
CREATE INDEX `placements_status_idx` ON `placements` (`status`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text NOT NULL,
	`bucket` text NOT NULL,
	`attempts` integer NOT NULL,
	`reset_at` integer NOT NULL,
	PRIMARY KEY(`key`, `bucket`)
);
--> statement-breakpoint
CREATE TABLE `refresh_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text NOT NULL,
	`family_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`rotated_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`admin_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `refresh_sessions_token_hash_unique` ON `refresh_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `refresh_sessions_admin_idx` ON `refresh_sessions` (`admin_id`);--> statement-breakpoint
CREATE TABLE `remote_clients` (
	`node_id` text NOT NULL,
	`remote_client_id` integer NOT NULL,
	`name` text NOT NULL,
	`public_data` text NOT NULL,
	`snapshot_hash` text NOT NULL,
	`upstream_version` text NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`missing_at` integer,
	PRIMARY KEY(`node_id`, `remote_client_id`),
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `remote_clients_name_idx` ON `remote_clients` (`name`);--> statement-breakpoint
CREATE INDEX `remote_clients_seen_idx` ON `remote_clients` (`node_id`,`last_seen_at`);--> statement-breakpoint
CREATE TABLE `subscription_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`managed_client_id` text NOT NULL,
	`token_prefix` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_ciphertext` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`revoked_at` integer,
	`rotated_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`managed_client_id`) REFERENCES `managed_clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_tokens_managed_client_id_unique` ON `subscription_tokens` (`managed_client_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_tokens_token_hash_unique` ON `subscription_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `sync_leases` (
	`name` text PRIMARY KEY NOT NULL,
	`holder_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`status` text NOT NULL,
	`error_code` text,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sync_runs_node_started_idx` ON `sync_runs` (`node_id`,`started_at`);