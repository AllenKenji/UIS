CREATE TABLE `cbmsThresholds` (
	`id` int AUTO_INCREMENT NOT NULL,
	`indicatorKey` varchar(100) NOT NULL,
	`indicatorName` varchar(200) NOT NULL,
	`baselinePct` decimal(6,2) NOT NULL,
	`warnThresholdPct` decimal(6,2) NOT NULL DEFAULT '5.00',
	`criticalThresholdPct` decimal(6,2) NOT NULL DEFAULT '10.00',
	`isActive` boolean NOT NULL DEFAULT true,
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cbmsThresholds_id` PRIMARY KEY(`id`),
	CONSTRAINT `cbmsThresholds_indicatorKey_unique` UNIQUE(`indicatorKey`)
);
--> statement-breakpoint
ALTER TABLE `cbmsThresholds` ADD CONSTRAINT `cbmsThresholds_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;