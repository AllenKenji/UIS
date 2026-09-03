CREATE TABLE `localAuthCredentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`username` varchar(100) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`salt` varchar(64) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `localAuthCredentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `localAuthCredentials_userId_unique` UNIQUE(`userId`),
	CONSTRAINT `localAuthCredentials_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
ALTER TABLE `localAuthCredentials` ADD CONSTRAINT `localAuthCredentials_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
