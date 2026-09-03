CREATE TABLE `draftComments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`draftId` int NOT NULL,
	`content` text NOT NULL,
	`authorId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `draftComments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `draftComments` ADD CONSTRAINT `draftComments_draftId_reportDrafts_id_fk` FOREIGN KEY (`draftId`) REFERENCES `reportDrafts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `draftComments` ADD CONSTRAINT `draftComments_authorId_users_id_fk` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;