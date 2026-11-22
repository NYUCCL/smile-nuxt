CREATE TABLE `console_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`session_id` text NOT NULL,
	`participant_id` text,
	`seq` integer NOT NULL,
	`entries` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `console_logs_session_seq_unique` ON `console_logs` (`session_id`,`seq`);--> statement-breakpoint
CREATE INDEX `console_logs_participant_idx` ON `console_logs` (`participant_id`);--> statement-breakpoint
CREATE INDEX `console_logs_project_created_idx` ON `console_logs` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `interaction_chunks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`participant_id` text NOT NULL,
	`route` text NOT NULL,
	`visit` integer NOT NULL,
	`seq` integer NOT NULL,
	`stream` blob NOT NULL,
	`event_count` integer DEFAULT 0 NOT NULL,
	`t_start` integer,
	`t_end` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interaction_chunks_unique` ON `interaction_chunks` (`participant_id`,`route`,`visit`,`seq`);--> statement-breakpoint
ALTER TABLE `participants` ADD `rev` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `participants` ADD `resume` text;--> statement-breakpoint
ALTER TABLE `participants` ADD `consented` integer;--> statement-breakpoint
ALTER TABLE `participants` ADD `done` integer;--> statement-breakpoint
ALTER TABLE `participants` ADD `withdrawn` integer;--> statement-breakpoint
ALTER TABLE `participants` ADD `recruitment_service` text;--> statement-breakpoint
ALTER TABLE `participants` ADD `started_at` integer;--> statement-breakpoint
ALTER TABLE `participants` ADD `ended_at` integer;--> statement-breakpoint
ALTER TABLE `participants` ADD `data_bytes` integer;--> statement-breakpoint
ALTER TABLE `participants` ADD `save_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `participants` ADD `oversize` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `participants` ADD `last_error` text;--> statement-breakpoint
CREATE INDEX `participants_project_updated_idx` ON `participants` (`project_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `participants_project_done_idx` ON `participants` (`project_id`,`done`);--> statement-breakpoint
-- A retried POST could leave several private_data rows for one participant.
-- Every PATCH updated all of them, so they hold the same data: keep the newest.
DELETE FROM `private_data` WHERE rowid NOT IN (
	SELECT rowid FROM (
		SELECT rowid, ROW_NUMBER() OVER (PARTITION BY `participant_id` ORDER BY `updated_at` DESC, rowid DESC) AS n
		FROM `private_data`
	) WHERE n = 1
);--> statement-breakpoint
CREATE UNIQUE INDEX `private_data_participant_unique` ON `private_data` (`participant_id`);
