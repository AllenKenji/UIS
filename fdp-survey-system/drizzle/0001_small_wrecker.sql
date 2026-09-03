CREATE TABLE `households` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barangay` varchar(255) NOT NULL,
	`municipality` varchar(255) NOT NULL,
	`province` varchar(255) NOT NULL DEFAULT 'Parañaque',
	`headOfFamily` varchar(255) NOT NULL,
	`age` int,
	`civilStatus` varchar(100),
	`occupation` varchar(255),
	`education` varchar(255),
	`monthlyIncome` decimal(10,2),
	`latitude` decimal(10,7),
	`longitude` decimal(10,7),
	`fourPsBeneficiary` boolean DEFAULT false,
	`tupadBeneficiary` boolean DEFAULT false,
	`seniorCitizen` boolean DEFAULT false,
	`pwdMember` boolean DEFAULT false,
	`indigenousPeople` boolean DEFAULT false,
	`surveyedBy` int,
	`surveyedAt` timestamp NOT NULL DEFAULT (now()),
	`verificationPhoto` text,
	`verificationPhotoKey` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `households_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `surveyResponses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`householdId` int NOT NULL,
	`sectionA` json,
	`sectionB` json,
	`sectionC` json,
	`sectionD` json,
	`sectionE` json,
	`sectionF` json,
	`sectionG` json,
	`sectionH` json,
	`sectionI` json,
	`sectionJ` json,
	`sectionK` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `surveyResponses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','surveyor','supervisor') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `households` ADD CONSTRAINT `households_surveyedBy_users_id_fk` FOREIGN KEY (`surveyedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `surveyResponses` ADD CONSTRAINT `surveyResponses_householdId_households_id_fk` FOREIGN KEY (`householdId`) REFERENCES `households`(`id`) ON DELETE cascade ON UPDATE no action;