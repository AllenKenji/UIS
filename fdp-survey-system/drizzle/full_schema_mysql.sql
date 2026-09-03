-- Source: 0000_remarkable_bloodstrike.sql
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);

-- Source: 0001_small_wrecker.sql
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

ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','surveyor','supervisor') NOT NULL DEFAULT 'user';
ALTER TABLE `households` ADD CONSTRAINT `households_surveyedBy_users_id_fk` FOREIGN KEY (`surveyedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `surveyResponses` ADD CONSTRAINT `surveyResponses_householdId_households_id_fk` FOREIGN KEY (`householdId`) REFERENCES `households`(`id`) ON DELETE cascade ON UPDATE no action;

-- Source: 0002_spooky_blob.sql
ALTER TABLE `households` ADD `status` enum('draft','submitted','approved','returned') DEFAULT 'submitted' NOT NULL;
ALTER TABLE `households` ADD `reviewedBy` int;
ALTER TABLE `households` ADD `reviewedAt` timestamp;
ALTER TABLE `households` ADD `returnReason` text;
ALTER TABLE `households` ADD CONSTRAINT `households_reviewedBy_users_id_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;

-- Source: 0003_fresh_kate_bishop.sql
CREATE TABLE `reportTemplates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`selectedFields` json NOT NULL,
	`filters` json,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reportTemplates_id` PRIMARY KEY(`id`)
);

ALTER TABLE `reportTemplates` ADD CONSTRAINT `reportTemplates_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;

-- Source: 0004_lean_blindfold.sql
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

ALTER TABLE `exportLayouts` ADD CONSTRAINT `exportLayouts_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;

-- Source: 0005_magical_firestar.sql
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

ALTER TABLE `reportDrafts` ADD CONSTRAINT `reportDrafts_customLayoutId_exportLayouts_id_fk` FOREIGN KEY (`customLayoutId`) REFERENCES `exportLayouts`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `reportDrafts` ADD CONSTRAINT `reportDrafts_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;

-- Source: 0006_solid_mikhail_rasputin.sql
CREATE TABLE `draftComments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`draftId` int NOT NULL,
	`content` text NOT NULL,
	`authorId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `draftComments_id` PRIMARY KEY(`id`)
);

ALTER TABLE `draftComments` ADD CONSTRAINT `draftComments_draftId_reportDrafts_id_fk` FOREIGN KEY (`draftId`) REFERENCES `reportDrafts`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `draftComments` ADD CONSTRAINT `draftComments_authorId_users_id_fk` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;

-- Source: 0007_lethal_gambit.sql
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

ALTER TABLE `cbmsThresholds` ADD CONSTRAINT `cbmsThresholds_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;

