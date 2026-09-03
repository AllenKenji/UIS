CREATE TABLE `reportDrafts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`shareToken` varchar(64) NOT NULL,
	`selectedFields` json NOT NULL,
	`filters` json,
	`exportLayout` varchar(50) NOT NULL,
	`customLayoutId` int,
	`isPublic` boolean NOT NULL DEFAULT false,
	`viewCount` int NOT NULL DEFAULT 0,
	`lastViewedAt` timestamp,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reportDrafts_id` PRIMARY KEY(`id`),
	CONSTRAINT `reportDrafts_shareToken_unique` UNIQUE(`shareToken`)
);
--> statement-breakpoint
ALTER TABLE `reportDrafts` ADD CONSTRAINT `reportDrafts_customLayoutId_exportLayouts_id_fk` FOREIGN KEY (`customLayoutId`) REFERENCES `exportLayouts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reportDrafts` ADD CONSTRAINT `reportDrafts_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;