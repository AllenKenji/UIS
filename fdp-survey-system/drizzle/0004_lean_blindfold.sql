CREATE TABLE `exportLayouts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`layoutType` varchar(50) NOT NULL,
	`preferences` json,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exportLayouts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `exportLayouts` ADD CONSTRAINT `exportLayouts_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;