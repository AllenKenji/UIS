ALTER TABLE `households` ADD `status` enum('draft','submitted','approved','returned') DEFAULT 'submitted' NOT NULL;--> statement-breakpoint
ALTER TABLE `households` ADD `reviewedBy` int;--> statement-breakpoint
ALTER TABLE `households` ADD `reviewedAt` timestamp;--> statement-breakpoint
ALTER TABLE `households` ADD `returnReason` text;--> statement-breakpoint
ALTER TABLE `households` ADD CONSTRAINT `households_reviewedBy_users_id_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;