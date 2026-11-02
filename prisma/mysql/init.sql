-- CreateTable
CREATE TABLE `Tenant` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `country` VARCHAR(191) NOT NULL,
    `province` VARCHAR(191) NULL,
    `orgType` ENUM('SME', 'LARGE', 'UNIVERSITY', 'RESEARCH', 'PUBLIC', 'NGO', 'CONSULTANCY', 'CLUSTER', 'MUNICIPALITY') NOT NULL DEFAULT 'SME',
    `pic` VARCHAR(191) NULL,
    `locale` VARCHAR(191) NOT NULL DEFAULT 'tr',
    `timezone` VARCHAR(191) NOT NULL DEFAULT 'Europe/Istanbul',
    `settings` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,
    `deletionReason` VARCHAR(191) NULL,
    `kind` ENUM('ORGANIZATION', 'AGENCY') NOT NULL DEFAULT 'ORGANIZATION',
    `agencyId` VARCHAR(191) NULL,

    UNIQUE INDEX `Tenant_slug_key`(`slug`),
    INDEX `Tenant_deletedAt_idx`(`deletedAt`),
    INDEX `Tenant_agencyId_idx`(`agencyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `AgencyInviteCode` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `codeHash` VARCHAR(191) NOT NULL,
    `codeHint` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `maxUses` INTEGER NULL,
    `usedCount` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `revokedBy` VARCHAR(191) NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AgencyInviteCode_codeHash_key`(`codeHash`),
    INDEX `AgencyInviteCode_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `emailVerified` DATETIME(3) NULL,
    `image` VARCHAR(191) NULL,
    `name` VARCHAR(191) NULL,
    `locale` VARCHAR(191) NOT NULL DEFAULT 'tr',
    `isPlatformAdmin` BOOLEAN NOT NULL DEFAULT false,
    `deletionRequestedAt` DATETIME(3) NULL,
    `deletedAt` DATETIME(3) NULL,
    `deletionReason` VARCHAR(191) NULL,
    `staleDigestOn` DATE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_deletionRequestedAt_idx`(`deletionRequestedAt`),
    INDEX `User_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Account` (
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `providerAccountId` VARCHAR(191) NOT NULL,
    `refresh_token` VARCHAR(191) NULL,
    `access_token` VARCHAR(191) NULL,
    `expires_at` INTEGER NULL,
    `token_type` VARCHAR(191) NULL,
    `scope` VARCHAR(191) NULL,
    `id_token` VARCHAR(191) NULL,
    `session_state` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`provider`, `providerAccountId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Session` (
    `sessionToken` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `expires` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Session_sessionToken_key`(`sessionToken`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `VerificationToken` (
    `identifier` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `expires` DATETIME(3) NOT NULL,

    PRIMARY KEY (`identifier`, `token`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Membership` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` ENUM('TENANT_OWNER', 'TENANT_ADMIN', 'PIPELINE_MANAGER', 'WRITER', 'MEMBER', 'GUEST_PARTNER') NOT NULL DEFAULT 'MEMBER',
    `workspaceIds` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `staleDigestOn` DATE NULL,

    INDEX `Membership_userId_idx`(`userId`),
    UNIQUE INDEX `Membership_tenantId_userId_key`(`tenantId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Workspace` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,
    `deletionReason` VARCHAR(191) NULL,

    INDEX `Workspace_deletedAt_idx`(`deletedAt`),
    UNIQUE INDEX `Workspace_tenantId_slug_key`(`tenantId`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `TenantProfile` (
    `tenantId` VARCHAR(191) NOT NULL,
    `capabilities` VARCHAR(191) NOT NULL,
    `keywords` JSON NOT NULL,
    `naceCodes` JSON NOT NULL,
    `trlRange` JSON NOT NULL,
    `preferredRoles` JSON NOT NULL,
    `priorProjects` JSON NOT NULL,
    `embedding` JSON NULL,
    `embeddingHash` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ModuleCatalog` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `version` VARCHAR(191) NOT NULL,
    `requires` JSON NOT NULL,
    `recommends` JSON NOT NULL,
    `planTiers` JSON NOT NULL,
    `addOnSku` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `ModuleCatalog_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ModuleState` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `moduleId` VARCHAR(191) NOT NULL,
    `status` ENUM('OFF', 'DEV', 'PILOT', 'ON') NOT NULL DEFAULT 'OFF',
    `settings` JSON NOT NULL,
    `changedBy` VARCHAR(191) NULL,
    `changedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `grandfathered` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `ModuleState_tenantId_moduleId_key`(`tenantId`, `moduleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Plan` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `monthlyCents` INTEGER NOT NULL,
    `yearlyCents` INTEGER NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `seats` INTEGER NOT NULL,
    `workspaces` INTEGER NOT NULL,
    `aiCreditsMonthly` INTEGER NOT NULL,
    `modules` JSON NOT NULL,
    `stripePriceMonthly` VARCHAR(191) NULL,
    `stripePriceYearly` VARCHAR(191) NULL,
    `visibility` VARCHAR(191) NOT NULL DEFAULT 'public',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PlanVersion` (
    `id` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `monthlyCents` INTEGER NOT NULL,
    `yearlyCents` INTEGER NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `seats` INTEGER NOT NULL,
    `workspaces` INTEGER NOT NULL,
    `aiCreditsMonthly` INTEGER NOT NULL,
    `modules` JSON NOT NULL,
    `publishedBy` VARCHAR(191) NULL,
    `publishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PlanVersion_planId_version_key`(`planId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PlanFeature` (
    `id` VARCHAR(191) NOT NULL,
    `planVersionId` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `moduleId` VARCHAR(191) NULL,
    `limitKey` VARCHAR(191) NULL,
    `textTr` VARCHAR(191) NULL,
    `textEn` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PlanFeature_planVersionId_order_idx`(`planVersionId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PlanAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `assignedBy` VARCHAR(191) NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `note` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PlanAssignment_planId_tenantId_key`(`planId`, `tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `AddOnCatalog` (
    `sku` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `monthlyCents` INTEGER NULL,
    `oneTimeCents` INTEGER NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'EUR',
    `grantsModule` VARCHAR(191) NULL,
    `grantsSeats` INTEGER NULL,
    `grantsCredits` INTEGER NULL,
    `grantsWorkspaces` INTEGER NULL,
    `stripePriceId` VARCHAR(191) NULL,

    PRIMARY KEY (`sku`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Subscription` (
    `tenantId` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(191) NOT NULL,
    `status` ENUM('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'PAUSED') NOT NULL DEFAULT 'TRIALING',
    `billingInterval` VARCHAR(191) NOT NULL DEFAULT 'month',
    `provider` VARCHAR(191) NOT NULL DEFAULT 'stripe',
    `providerCustomerId` VARCHAR(191) NULL,
    `providerSubId` VARCHAR(191) NULL,
    `currentPeriodEnd` DATETIME(3) NULL,
    `seatsExtra` INTEGER NOT NULL DEFAULT 0,
    `workspacesExtra` INTEGER NOT NULL DEFAULT 0,
    `trialEndsAt` DATETIME(3) NULL,
    `lockedTierCode` VARCHAR(191) NULL,
    `lockedPercentOff` INTEGER NULL,
    `lockedAmountMinor` INTEGER NULL,
    `lockedCurrency` VARCHAR(191) NULL,
    `priceLockedAt` DATETIME(3) NULL,
    `planVersionId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `AddOn` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `sku` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `providerItemId` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endedAt` DATETIME(3) NULL,

    INDEX `AddOn_tenantId_sku_idx`(`tenantId`, `sku`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `LifetimeLicence` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `seq` INTEGER NOT NULL,
    `sku` VARCHAR(191) NOT NULL DEFAULT 'lifetime-ultra',
    `amountMinor` INTEGER NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `provider` VARCHAR(191) NOT NULL DEFAULT 'stripe',
    `providerEventId` VARCHAR(191) NOT NULL,
    `providerSessionId` VARCHAR(191) NULL,
    `purchasedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `LifetimeLicence_seq_key`(`seq`),
    UNIQUE INDEX `LifetimeLicence_providerEventId_key`(`providerEventId`),
    UNIQUE INDEX `LifetimeLicence_providerSessionId_key`(`providerSessionId`),
    INDEX `LifetimeLicence_tenantId_purchasedAt_idx`(`tenantId`, `purchasedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Invoice` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `issuedAt` DATETIME(3) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'TRY',
    `fxRate` DECIMAL(18, 6) NULL,
    `fxRateDate` DATE NULL,
    `fxRateSource` VARCHAR(191) NULL,
    `grandTotalTryMinor` INTEGER NULL,
    `buyerName` VARCHAR(191) NOT NULL,
    `buyerVknTckn` VARCHAR(191) NOT NULL,
    `buyerTaxOffice` VARCHAR(191) NOT NULL,
    `buyerAddress` VARCHAR(191) NOT NULL,
    `buyerCity` VARCHAR(191) NOT NULL,
    `buyerCountry` VARCHAR(191) NOT NULL DEFAULT 'Türkiye',
    `lines` JSON NOT NULL,
    `profileId` VARCHAR(191) NOT NULL DEFAULT 'TICARIFATURA',
    `invoiceType` VARCHAR(191) NOT NULL DEFAULT 'SATIS',
    `ettn` VARCHAR(191) NOT NULL,
    `gibEnvelopeId` VARCHAR(191) NULL,
    `paymentRef` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Invoice_ettn_key`(`ettn`),
    INDEX `Invoice_tenantId_issuedAt_idx`(`tenantId`, `issuedAt`),
    UNIQUE INDEX `Invoice_tenantId_number_key`(`tenantId`, `number`),
    UNIQUE INDEX `Invoice_tenantId_paymentRef_key`(`tenantId`, `paymentRef`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `TenantBillingIdentity` (
    `tenantId` VARCHAR(191) NOT NULL,
    `buyerName` VARCHAR(191) NOT NULL,
    `buyerVknTckn` VARCHAR(191) NOT NULL,
    `buyerTaxOffice` VARCHAR(191) NOT NULL,
    `buyerAddress` VARCHAR(191) NOT NULL,
    `buyerCity` VARCHAR(191) NOT NULL,
    `buyerCountry` VARCHAR(191) NOT NULL DEFAULT 'Türkiye',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `CreditLedger` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `delta` INTEGER NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `refId` VARCHAR(191) NULL,
    `grantPeriod` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CreditLedger_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    UNIQUE INDEX `CreditLedger_tenantId_grantPeriod_key`(`tenantId`, `grantPeriod`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PlatformSetting` (
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Programme` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sourceKey` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Call` (
    `id` VARCHAR(191) NOT NULL,
    `programmeId` VARCHAR(191) NOT NULL,
    `callIdentifier` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `openDate` DATETIME(3) NULL,
    `budgetCents` BIGINT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'EUR',
    `url` VARCHAR(191) NULL,

    UNIQUE INDEX `Call_callIdentifier_key`(`callIdentifier`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Topic` (
    `id` VARCHAR(191) NOT NULL,
    `callId` VARCHAR(191) NOT NULL,
    `identifier` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `status` ENUM('FORTHCOMING', 'OPEN', 'CLOSED') NOT NULL DEFAULT 'FORTHCOMING',
    `typeOfAction` VARCHAR(191) NULL,
    `isLumpSum` BOOLEAN NOT NULL DEFAULT false,
    `isTwoStage` BOOLEAN NOT NULL DEFAULT false,
    `budgetPerProjectCents` BIGINT NULL,
    `numProjects` INTEGER NULL,
    `deadlines` JSON NOT NULL,
    `nextDeadlineAt` DATETIME(3) NULL,
    `eligibility` JSON NOT NULL,
    `destination` VARCHAR(191) NULL,
    `keywords` JSON NOT NULL,
    `description` VARCHAR(191) NULL,
    `sourceUrl` VARCHAR(191) NULL,
    `rawHash` VARCHAR(191) NULL,
    `embedding` JSON NULL,
    `embeddingHash` VARCHAR(191) NULL,
    `fetchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Topic_identifier_key`(`identifier`),
    INDEX `Topic_nextDeadlineAt_idx`(`nextDeadlineAt`),
    INDEX `Topic_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `TopicStat` (
    `id` VARCHAR(191) NOT NULL,
    `topicId` VARCHAR(191) NULL,
    `topicPrefix` VARCHAR(191) NOT NULL,
    `country` VARCHAR(191) NULL,
    `orgType` VARCHAR(191) NULL,
    `proposals` INTEGER NULL,
    `funded` INTEGER NULL,
    `successRate` DOUBLE NULL,
    `source` VARCHAR(191) NOT NULL,
    `importedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TopicStat_topicPrefix_idx`(`topicPrefix`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `RawFetch` (
    `id` VARCHAR(191) NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `hash` VARCHAR(191) NOT NULL,
    `storageUrl` VARCHAR(191) NULL,
    `payload` JSON NULL,
    `fetchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RawFetch_source_key_idx`(`source`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `SystemAlert` (
    `id` VARCHAR(191) NOT NULL,
    `level` VARCHAR(191) NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `meta` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,

    INDEX `SystemAlert_createdAt_idx`(`createdAt`),
    INDEX `SystemAlert_source_createdAt_idx`(`source`, `createdAt`),
    INDEX `SystemAlert_resolvedAt_createdAt_idx`(`resolvedAt`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `BlogPost` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `excerpt` VARCHAR(191) NOT NULL,
    `content` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `readMinutes` INTEGER NOT NULL,
    `publishedAt` DATETIME(3) NOT NULL,
    `authorName` VARCHAR(191) NULL,
    `authorRole` VARCHAR(191) NULL,
    `authorAvatar` VARCHAR(191) NULL,
    `image` VARCHAR(191) NOT NULL,
    `featured` BOOLEAN NOT NULL DEFAULT false,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BlogPost_slug_key`(`slug`),
    INDEX `BlogPost_publishedAt_idx`(`publishedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PublicLead` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `organisation` VARCHAR(191) NOT NULL,
    `province` VARCHAR(191) NULL,
    `district` VARCHAR(191) NULL,
    `readinessCode` VARCHAR(191) NULL,
    `readinessTotal` INTEGER NULL,
    `readinessLevel` VARCHAR(191) NULL,
    `consentVersion` VARCHAR(191) NOT NULL,
    `consentAt` DATETIME(3) NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `locale` VARCHAR(191) NOT NULL,
    `ipHash` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PublicLead_createdAt_idx`(`createdAt`),
    INDEX `PublicLead_email_createdAt_idx`(`email`, `createdAt`),
    INDEX `PublicLead_ipHash_createdAt_idx`(`ipHash`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ExpertPreRegistration` (
    `id` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `emailVerifiedAt` DATETIME(3) NULL,
    `province` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `organization` VARCHAR(191) NULL,
    `isFreelancer` BOOLEAN NOT NULL,
    `expertiseAreas` JSON NOT NULL,
    `roles` JSON NOT NULL,
    `programmes` JSON NOT NULL,
    `projectCodes` VARCHAR(191) NULL,
    `orcid` VARCHAR(191) NULL,
    `linkedinUrl` VARCHAR(191) NULL,
    `languages` JSON NOT NULL,
    `referredBy` VARCHAR(191) NULL,
    `utmSource` VARCHAR(191) NULL,
    `utmMedium` VARCHAR(191) NULL,
    `utmCampaign` VARCHAR(191) NULL,
    `kvkkAcceptedAt` DATETIME(3) NOT NULL,
    `visibilityConsentAt` DATETIME(3) NOT NULL,
    `marketingConsentAt` DATETIME(3) NULL,
    `consentTextVersion` VARCHAR(191) NOT NULL DEFAULT 'kvkk-v1',
    `locale` VARCHAR(191) NOT NULL,
    `verifyTokenHash` VARCHAR(191) NULL,
    `verifyTokenExpiresAt` DATETIME(3) NULL,
    `founderNumber` INTEGER NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `ipHash` VARCHAR(191) NULL,
    `verifyMailCount` INTEGER NOT NULL DEFAULT 0,
    `verifyMailWindowStart` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSubmittedAt` DATETIME(3) NULL,

    UNIQUE INDEX `ExpertPreRegistration_email_key`(`email`),
    UNIQUE INDEX `ExpertPreRegistration_verifyTokenHash_key`(`verifyTokenHash`),
    UNIQUE INDEX `ExpertPreRegistration_founderNumber_key`(`founderNumber`),
    INDEX `ExpertPreRegistration_createdAt_idx`(`createdAt`),
    INDEX `ExpertPreRegistration_ipHash_createdAt_idx`(`ipHash`, `createdAt`),
    INDEX `ExpertPreRegistration_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ExpertPreRegAttempt` (
    `id` VARCHAR(191) NOT NULL,
    `ipHash` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ExpertPreRegAttempt_createdAt_idx`(`createdAt`),
    INDEX `ExpertPreRegAttempt_ipHash_createdAt_idx`(`ipHash`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ExpertFounderCounter` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `lastNumber` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `TopicMatch` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `topicId` VARCHAR(191) NOT NULL,
    `opportunityId` VARCHAR(191) NULL,
    `fitScore` DOUBLE NOT NULL,
    `g0Score` DOUBLE NULL,
    `breakdown` JSON NOT NULL,
    `computedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TopicMatch_tenantId_g0Score_idx`(`tenantId`, `g0Score`),
    INDEX `TopicMatch_tenantId_opportunityId_idx`(`tenantId`, `opportunityId`),
    UNIQUE INDEX `TopicMatch_tenantId_topicId_opportunityId_key`(`tenantId`, `topicId`, `opportunityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `SavedSearch` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `filters` JSON NOT NULL,
    `notify` BOOLEAN NOT NULL DEFAULT true,
    `lastRunAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SavedSearch_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `CordisProject` (
    `id` VARCHAR(191) NOT NULL,
    `rcn` VARCHAR(191) NULL,
    `acronym` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `objective` LONGTEXT NULL,
    `status` VARCHAR(191) NULL,
    `framework` VARCHAR(191) NOT NULL,
    `masterCall` VARCHAR(191) NULL,
    `subCall` VARCHAR(191) NULL,
    `fundingScheme` VARCHAR(191) NULL,
    `legalBasis` VARCHAR(191) NULL,
    `startDate` DATETIME(3) NULL,
    `endDate` DATETIME(3) NULL,
    `ecSignatureDate` DATETIME(3) NULL,
    `totalCost` BIGINT NULL,
    `ecMaxContribution` BIGINT NULL,
    `grantDoi` VARCHAR(191) NULL,
    `contentUpdateDate` DATETIME(3) NULL,
    `rawJson` JSON NULL,
    `importedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CordisProject_startDate_idx`(`startDate`),
    INDEX `CordisProject_masterCall_idx`(`masterCall`),
    INDEX `CordisProject_framework_idx`(`framework`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `CordisOrganization` (
    `organisationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `nameNormalized` VARCHAR(191) NULL,
    `shortName` VARCHAR(191) NULL,
    `vatNumber` VARCHAR(191) NULL,
    `activityType` VARCHAR(191) NULL,
    `sme` BOOLEAN NOT NULL DEFAULT false,
    `country` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `postCode` VARCHAR(191) NULL,
    `nutsCode` VARCHAR(191) NULL,
    `geolocation` VARCHAR(191) NULL,
    `url` VARCHAR(191) NULL,
    `isTurkish` BOOLEAN NOT NULL DEFAULT false,
    `rawJson` JSON NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `hasActiveAnnouncements` BOOLEAN NOT NULL DEFAULT false,
    `lastAnnouncementAt` DATETIME(3) NULL,
    `portalProfileFetchedAt` DATETIME(3) NULL,

    INDEX `CordisOrganization_country_idx`(`country`),
    INDEX `CordisOrganization_activityType_idx`(`activityType`),
    INDEX `CordisOrganization_nameNormalized_idx`(`nameNormalized`),
    INDEX `CordisOrganization_isTurkish_idx`(`isTurkish`),
    PRIMARY KEY (`organisationId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `CordisParticipation` (
    `projectId` VARCHAR(191) NOT NULL,
    `organisationId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL,
    `order` INTEGER NULL,
    `ecContribution` BIGINT NULL,
    `netEcContribution` BIGINT NULL,
    `totalCost` BIGINT NULL,
    `endOfParticipation` BOOLEAN NULL DEFAULT false,
    `active` BOOLEAN NULL DEFAULT true,

    INDEX `CordisParticipation_organisationId_idx`(`organisationId`),
    INDEX `CordisParticipation_projectId_idx`(`projectId`),
    INDEX `CordisParticipation_role_idx`(`role`),
    PRIMARY KEY (`projectId`, `organisationId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `CordisProjectTopic` (
    `projectId` VARCHAR(191) NOT NULL,
    `topicCode` VARCHAR(191) NOT NULL,
    `topicTitle` VARCHAR(191) NULL,

    INDEX `CordisProjectTopic_topicCode_idx`(`topicCode`),
    PRIMARY KEY (`projectId`, `topicCode`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `CordisProjectSciVoc` (
    `projectId` VARCHAR(191) NOT NULL,
    `scivocCode` VARCHAR(191) NOT NULL,
    `scivocPath` VARCHAR(191) NULL,
    `scivocTitle` VARCHAR(191) NULL,

    PRIMARY KEY (`projectId`, `scivocCode`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `CordisImportRun` (
    `runId` VARCHAR(191) NOT NULL,
    `dataset` VARCHAR(191) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL,
    `fileHash` VARCHAR(191) NULL,
    `rowCounts` JSON NULL,
    `error` LONGTEXT NULL,

    PRIMARY KEY (`runId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `CordisPartnerProfile` (
    `organisationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `nameNormalized` VARCHAR(191) NULL,
    `country` VARCHAR(191) NULL,
    `activityType` VARCHAR(191) NULL,
    `sme` BOOLEAN NOT NULL DEFAULT false,
    `isTurkish` BOOLEAN NOT NULL DEFAULT false,
    `totalProjects` INTEGER NOT NULL DEFAULT 0,
    `horizonProjects` INTEGER NOT NULL DEFAULT 0,
    `h2020Projects` INTEGER NOT NULL DEFAULT 0,
    `coordinatorProjects` INTEGER NOT NULL DEFAULT 0,
    `activeProjects` INTEGER NOT NULL DEFAULT 0,
    `totalEcContribution` BIGINT NOT NULL DEFAULT 0,
    `lastProjectDate` DATETIME(3) NULL,
    `topTopics` JSON NOT NULL,
    `topCountries` JSON NOT NULL,
    `topPartners` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CordisPartnerProfile_country_activityType_idx`(`country`, `activityType`),
    INDEX `CordisPartnerProfile_totalProjects_idx`(`totalProjects`),
    INDEX `CordisPartnerProfile_coordinatorProjects_idx`(`coordinatorProjects`),
    INDEX `CordisPartnerProfile_isTurkish_idx`(`isTurkish`),
    PRIMARY KEY (`organisationId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `CordisCoParticipation` (
    `orgA` VARCHAR(191) NOT NULL,
    `orgB` VARCHAR(191) NOT NULL,
    `sharedProjectCount` INTEGER NOT NULL DEFAULT 0,
    `lastSharedYear` INTEGER NULL,

    INDEX `CordisCoParticipation_orgA_idx`(`orgA`),
    INDEX `CordisCoParticipation_orgB_idx`(`orgB`),
    PRIMARY KEY (`orgA`, `orgB`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PartnerSearchAnnouncement` (
    `id` VARCHAR(191) NOT NULL,
    `externalId` VARCHAR(191) NOT NULL,
    `topicIdentifier` VARCHAR(191) NOT NULL,
    `callIdentifier` VARCHAR(191) NULL,
    `type` ENUM('EXPERTISE_REQUEST', 'EXPERTISE_OFFER') NOT NULL,
    `description` VARCHAR(500) NULL,
    `publishedAt` DATETIME(3) NULL,
    `lastSeenAt` DATETIME(3) NOT NULL,
    `withdrawnAt` DATETIME(3) NULL,
    `missedScans` INTEGER NOT NULL DEFAULT 0,
    `missedScanAt` DATETIME(3) NULL,
    `organizationPic` VARCHAR(191) NULL,
    `organizationName` VARCHAR(191) NOT NULL,
    `organizationType` ENUM('HES', 'REC', 'PRC', 'PUB', 'OTH') NOT NULL DEFAULT 'OTH',
    `isSme` BOOLEAN NOT NULL DEFAULT false,
    `country` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `keywords` JSON NOT NULL,
    `programmeCodes` JSON NOT NULL,
    `source` ENUM('PORTAL_API', 'TOPIC_HTML') NOT NULL,
    `raw` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PartnerSearchAnnouncement_externalId_key`(`externalId`),
    INDEX `PartnerSearchAnnouncement_topicIdentifier_idx`(`topicIdentifier`),
    INDEX `PartnerSearchAnnouncement_organizationPic_idx`(`organizationPic`),
    INDEX `PartnerSearchAnnouncement_country_idx`(`country`),
    INDEX `PartnerSearchAnnouncement_type_idx`(`type`),
    INDEX `PartnerSearchAnnouncement_lastSeenAt_idx`(`lastSeenAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PartnerProfileSnapshot` (
    `pic` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('HES', 'REC', 'PRC', 'PUB', 'OTH') NOT NULL DEFAULT 'OTH',
    `country` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `description` LONGTEXT NULL,
    `keywords` JSON NOT NULL,
    `projectCount` INTEGER NOT NULL DEFAULT 0,
    `announcementCount` INTEGER NOT NULL DEFAULT 0,
    `programmes` JSON NOT NULL,
    `topCollaborators` JSON NOT NULL,
    `fetchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PartnerProfileSnapshot_country_idx`(`country`),
    PRIMARY KEY (`pic`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PartnerSearchIngestionRun` (
    `id` VARCHAR(191) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `trigger` ENUM('FULL', 'INCREMENTAL', 'MANUAL') NOT NULL,
    `topicsScanned` INTEGER NOT NULL DEFAULT 0,
    `created` INTEGER NOT NULL DEFAULT 0,
    `updated` INTEGER NOT NULL DEFAULT 0,
    `withdrawn` INTEGER NOT NULL DEFAULT 0,
    `personAnnouncementCount` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED') NOT NULL DEFAULT 'RUNNING',
    `error` LONGTEXT NULL,

    INDEX `PartnerSearchIngestionRun_startedAt_idx`(`startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `UnmatchedOrganization` (
    `id` VARCHAR(191) NOT NULL,
    `matchKey` VARCHAR(191) NOT NULL,
    `pic` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `country` VARCHAR(191) NULL,
    `firstSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL,
    `resolvedPic` VARCHAR(191) NULL,

    UNIQUE INDEX `UnmatchedOrganization_matchKey_key`(`matchKey`),
    INDEX `UnmatchedOrganization_pic_idx`(`pic`),
    INDEX `UnmatchedOrganization_resolvedPic_idx`(`resolvedPic`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PartnerSearchTopicStat` (
    `topicIdentifier` VARCHAR(191) NOT NULL,
    `personAnnouncementCount` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`topicIdentifier`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PartnerSearchQuotaUsage` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `month` VARCHAR(191) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PartnerSearchQuotaUsage_tenantId_month_key`(`tenantId`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Opportunity` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `topicId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `stage` ENUM('G0', 'G1', 'G2', 'G3', 'G4') NOT NULL DEFAULT 'G0',
    `status` ENUM('ACTIVE', 'WITHDRAWN', 'SUBMITTED', 'FUNDED', 'REJECTED', 'ABOVE_THRESHOLD') NOT NULL DEFAULT 'ACTIVE',
    `intendedRole` VARCHAR(191) NULL,
    `ownerId` VARCHAR(191) NULL,
    `g0Score` DOUBLE NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,
    `deletionReason` VARCHAR(191) NULL,

    INDEX `Opportunity_tenantId_workspaceId_stage_idx`(`tenantId`, `workspaceId`, `stage`),
    INDEX `Opportunity_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `GateDecision` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `opportunityId` VARCHAR(191) NOT NULL,
    `gate` ENUM('G0', 'G1', 'G2', 'G3', 'G4') NOT NULL,
    `passed` BOOLEAN NOT NULL,
    `inputs` JSON NOT NULL,
    `ruleVersion` VARCHAR(191) NOT NULL,
    `decidedBy` VARCHAR(191) NOT NULL,
    `decidedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,
    `deletionReason` VARCHAR(191) NULL,

    INDEX `GateDecision_tenantId_opportunityId_idx`(`tenantId`, `opportunityId`),
    INDEX `GateDecision_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ConsortiumSeat` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `opportunityId` VARCHAR(191) NOT NULL,
    `roleKey` VARCHAR(191) NOT NULL,
    `required` BOOLEAN NOT NULL DEFAULT true,
    `organizationId` VARCHAR(191) NULL,
    `partnerOrgId` VARCHAR(191) NULL,
    `status` ENUM('OPEN', 'CANDIDATE', 'INVITED', 'CONFIRMED', 'DECLINED') NOT NULL DEFAULT 'OPEN',
    `budgetCents` BIGINT NULL,
    `personMonths` DOUBLE NULL,

    INDEX `ConsortiumSeat_tenantId_opportunityId_idx`(`tenantId`, `opportunityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PartnerOrg` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `country` VARCHAR(191) NULL,
    `orgType` VARCHAR(191) NULL,
    `pic` VARCHAR(191) NULL,
    `website` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PartnerOrg_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Proposal` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `opportunityId` VARCHAR(191) NOT NULL,
    `acronym` VARCHAR(191) NULL,
    `submittedAt` DATETIME(3) NULL,
    `esrScores` JSON NULL,
    `esrFileUrl` VARCHAR(191) NULL,
    `outcome` VARCHAR(191) NULL,
    `deletedAt` DATETIME(3) NULL,
    `deletionReason` VARCHAR(191) NULL,

    UNIQUE INDEX `Proposal_opportunityId_key`(`opportunityId`),
    INDEX `Proposal_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Effort` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `opportunityId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `hours` DOUBLE NOT NULL,
    `note` VARCHAR(191) NULL,
    `deletedAt` DATETIME(3) NULL,
    `deletionReason` VARCHAR(191) NULL,

    INDEX `Effort_tenantId_opportunityId_idx`(`tenantId`, `opportunityId`),
    INDEX `Effort_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Evidence` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL DEFAULT 'certificate',
    `title` VARCHAR(191) NOT NULL,
    `body` LONGTEXT NOT NULL,
    `description` LONGTEXT NULL,
    `language` VARCHAR(191) NOT NULL DEFAULT 'tr',
    `issuingAuthority` VARCHAR(191) NULL,
    `documentNumber` VARCHAR(191) NULL,
    `issuedAt` DATETIME(3) NULL,
    `validFrom` DATETIME(3) NULL,
    `validUntil` DATETIME(3) NULL,
    `confidentiality` VARCHAR(191) NOT NULL DEFAULT 'INTERNAL',
    `status` VARCHAR(191) NOT NULL DEFAULT 'VALID',
    `version` INTEGER NOT NULL DEFAULT 1,
    `r2ObjectKey` VARCHAR(191) NULL,
    `fileBucket` VARCHAR(191) NOT NULL DEFAULT 'fonbridge-evidence',
    `fileName` VARCHAR(191) NULL,
    `fileSizeBytes` INTEGER NULL,
    `mimeType` VARCHAR(191) NULL,
    `checksumSha256` VARCHAR(191) NULL,
    `fileUrl` VARCHAR(191) NULL,
    `sourceUrl` VARCHAR(191) NULL,
    `sourceDate` DATETIME(3) NULL,
    `ocrText` LONGTEXT NULL,
    `extractedFields` JSON NOT NULL,
    `tags` JSON NOT NULL,
    `lastUsedIn` VARCHAR(191) NULL,
    `createdBy` VARCHAR(191) NOT NULL DEFAULT 'system',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Evidence_tenantId_kind_idx`(`tenantId`, `kind`),
    INDEX `Evidence_tenantId_category_idx`(`tenantId`, `category`),
    INDEX `Evidence_tenantId_status_idx`(`tenantId`, `status`),
    INDEX `Evidence_validUntil_idx`(`validUntil`),
    UNIQUE INDEX `Evidence_tenantId_r2ObjectKey_key`(`tenantId`, `r2ObjectKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Claim` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `statement` LONGTEXT NOT NULL,
    `statementEn` LONGTEXT NULL,
    `confidenceScore` DOUBLE NOT NULL DEFAULT 1.0,
    `tags` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Claim_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ClaimEvidenceLink` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `claimId` VARCHAR(191) NOT NULL,
    `evidenceId` VARCHAR(191) NOT NULL,
    `isPrimary` BOOLEAN NOT NULL DEFAULT true,
    `notes` VARCHAR(191) NULL,

    INDEX `ClaimEvidenceLink_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `ClaimEvidenceLink_claimId_evidenceId_key`(`claimId`, `evidenceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ProposalUsage` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `opportunityId` VARCHAR(191) NOT NULL,
    `evidenceId` VARCHAR(191) NOT NULL,
    `sectionKey` VARCHAR(191) NOT NULL,
    `usedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `usedByUserId` VARCHAR(191) NULL,

    INDEX `ProposalUsage_tenantId_opportunityId_idx`(`tenantId`, `opportunityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ConceptTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `key` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `schema` JSON NOT NULL,
    `version` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ConceptNote` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `opportunityId` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `content` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ConceptNote_tenantId_opportunityId_idx`(`tenantId`, `opportunityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Relationship` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NULL,
    `partnerOrgId` VARCHAR(191) NULL,
    `kind` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NULL,
    `counterpartName` VARCHAR(191) NULL,
    `counterpartEmail` VARCHAR(191) NULL,
    `warmth` VARCHAR(191) NOT NULL DEFAULT 'cold',
    `lastContactAt` DATETIME(3) NULL,
    `nextStep` VARCHAR(191) NULL,
    `nextStepDue` DATETIME(3) NULL,
    `notes` VARCHAR(191) NULL,
    `staleRemindedAt` DATETIME(3) NULL,
    `staleRemindedContactAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Relationship_tenantId_ownerUserId_idx`(`tenantId`, `ownerUserId`),
    INDEX `Relationship_tenantId_lastContactAt_idx`(`tenantId`, `lastContactAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Interaction` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `relationshipId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `at` DATETIME(3) NOT NULL,
    `summary` VARCHAR(191) NULL,
    `briefId` VARCHAR(191) NULL,
    `createdBy` VARCHAR(191) NOT NULL,

    INDEX `Interaction_tenantId_relationshipId_idx`(`tenantId`, `relationshipId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `SeatCandidate` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `seatId` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NULL,
    `partnerOrgId` VARCHAR(191) NULL,
    `score` DOUBLE NOT NULL,
    `breakdown` JSON NOT NULL,
    `rank` INTEGER NOT NULL,
    `computedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SeatCandidate_tenantId_seatId_rank_idx`(`tenantId`, `seatId`, `rank`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `AiUsageLog` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `module` VARCHAR(191) NOT NULL,
    `purpose` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `promptHash` VARCHAR(191) NOT NULL,
    `inputTokens` INTEGER NOT NULL,
    `outputTokens` INTEGER NOT NULL,
    `credits` INTEGER NOT NULL,
    `proposalId` VARCHAR(191) NULL,
    `section` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AiUsageLog_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    INDEX `AiUsageLog_tenantId_proposalId_idx`(`tenantId`, `proposalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Document` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `kind` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `sourceUrl` VARCHAR(191) NULL,
    `fileUrl` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Chunk` (
    `id` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `ordinal` INTEGER NOT NULL,
    `text` VARCHAR(191) NOT NULL,
    `embedding` JSON NULL,

    INDEX `Chunk_documentId_idx`(`documentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `AuditEvent` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `actorId` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `target` VARCHAR(191) NULL,
    `data` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditEvent_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `StripeEventLog` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `stripeEventId` VARCHAR(191) NOT NULL,
    `handler` VARCHAR(191) NOT NULL,
    `processedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StripeEventLog_stripeEventId_key`(`stripeEventId`),
    INDEX `StripeEventLog_tenantId_processedAt_idx`(`tenantId`, `processedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NULL,
    `type` ENUM('SAVED_SEARCH_MATCH', 'CREDIT_GRANTED', 'CREDIT_EXHAUSTED', 'EVIDENCE_EXPIRING') NOT NULL,
    `payload` JSON NOT NULL,
    `dedupeKey` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `readAt` DATETIME(3) NULL,

    INDEX `Notification_tenantId_userId_readAt_createdAt_idx`(`tenantId`, `userId`, `readAt`, `createdAt`),
    INDEX `Notification_createdAt_idx`(`createdAt`),
    UNIQUE INDEX `Notification_tenantId_userId_dedupeKey_key`(`tenantId`, `userId`, `dedupeKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Evaluation` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `opportunityId` VARCHAR(191) NOT NULL,
    `proposalId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `readerType` VARCHAR(191) NOT NULL DEFAULT 'HUMAN',
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `avgScore` DOUBLE NULL,
    `excellence` DOUBLE NOT NULL DEFAULT 0,
    `impact` DOUBLE NOT NULL DEFAULT 0,
    `implementation` DOUBLE NOT NULL DEFAULT 0,
    `weaknesses` JSON NULL,
    `calibration` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Evaluation_tenantId_proposalId_idx`(`tenantId`, `proposalId`),
    INDEX `Evaluation_tenantId_opportunityId_idx`(`tenantId`, `opportunityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Reviewer` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `evaluationId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'evaluator',
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Reviewer_evaluationId_status_idx`(`evaluationId`, `status`),
    INDEX `Reviewer_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `Reviewer_evaluationId_userId_key`(`evaluationId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Criterion` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `evaluationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `weight` DOUBLE NOT NULL DEFAULT 0,
    `order` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Criterion_tenantId_evaluationId_idx`(`tenantId`, `evaluationId`),
    UNIQUE INDEX `Criterion_evaluationId_name_key`(`evaluationId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Score` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `reviewerId` VARCHAR(191) NOT NULL,
    `criterionId` VARCHAR(191) NOT NULL,
    `score` INTEGER NOT NULL,
    `comment` LONGTEXT NULL,
    `submittedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Score_criterionId_idx`(`criterionId`),
    INDEX `Score_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `Score_reviewerId_criterionId_key`(`reviewerId`, `criterionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `MeetingBrief` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `interactionId` VARCHAR(191) NOT NULL,
    `partnerName` VARCHAR(191) NULL,
    `content` VARCHAR(191) NOT NULL,
    `meetingScheduledAt` DATETIME(3) NULL,
    `meetingScheduledTz` VARCHAR(191) NOT NULL DEFAULT 'Europe/Brussels',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `opportunityId` VARCHAR(191) NULL,

    UNIQUE INDEX `MeetingBrief_interactionId_key`(`interactionId`),
    INDEX `MeetingBrief_tenantId`(`tenantId`),
    INDEX `MeetingBrief_tenantId_opportunityId_idx`(`tenantId`, `opportunityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `CalendarConnection` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `externalId` VARCHAR(191) NULL,
    `accessToken` VARCHAR(191) NULL,
    `refreshToken` VARCHAR(191) NULL,
    `tokenExpiresAt` DATETIME(3) NULL,
    `isConnected` BOOLEAN NOT NULL DEFAULT true,
    `lastSyncAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CalendarConnection_tenantId_idx`(`tenantId`),
    INDEX `CalendarConnection_userId_idx`(`userId`),
    UNIQUE INDEX `CalendarConnection_tenantId_userId_provider_key`(`tenantId`, `userId`, `provider`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `FollowupDoc` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `opportunityId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `contentUrl` VARCHAR(191) NULL,
    `signedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `approvalSubmittedAt` DATETIME(3) NULL,
    `approvalSubmittedById` VARCHAR(191) NULL,
    `approvalSubmittedByName` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `DualApprovalStep` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `followupDocId` VARCHAR(191) NOT NULL,
    `department` VARCHAR(191) NOT NULL,
    `actorUserId` VARCHAR(191) NOT NULL,
    `actorName` VARCHAR(191) NOT NULL,
    `note` VARCHAR(191) NULL,
    `decidedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DualApprovalStep_tenantId_followupDocId_idx`(`tenantId`, `followupDocId`),
    UNIQUE INDEX `DualApprovalStep_followupDocId_department_key`(`followupDocId`, `department`),
    UNIQUE INDEX `DualApprovalStep_followupDocId_actorUserId_key`(`followupDocId`, `actorUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ApplicationPart` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `opportunityId` VARCHAR(191) NOT NULL,
    `part` VARCHAR(191) NOT NULL,
    `content` JSON NULL,
    `magicTokenHash` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ApplicationPart_magicTokenHash_key`(`magicTokenHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `TtoPortfolioItem` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `trl` INTEGER NOT NULL DEFAULT 5,
    `patentStatus` VARCHAR(191) NOT NULL,
    `summary` VARCHAR(191) NOT NULL,
    `keywords` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TtoPortfolioItem_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ApiKey` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `keyHash` VARCHAR(191) NOT NULL,
    `prefix` VARCHAR(191) NOT NULL,
    `lastUsedAt` DATETIME(3) NULL,
    `rateWindowStartedAt` DATETIME(3) NULL,
    `rateWindowCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ApiKey_keyHash_key`(`keyHash`),
    INDEX `ApiKey_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Invitation` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `role` ENUM('TENANT_OWNER', 'TENANT_ADMIN', 'PIPELINE_MANAGER', 'WRITER', 'MEMBER', 'GUEST_PARTNER') NOT NULL DEFAULT 'MEMBER',
    `tokenHash` VARCHAR(191) NOT NULL,
    `expires` DATETIME(3) NOT NULL,
    `acceptedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Invitation_tokenHash_key`(`tokenHash`),
    UNIQUE INDEX `Invitation_email_tenantId_key`(`email`, `tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ApprovalRequest` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NULL,
    `actionType` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `payload` JSON NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `requiredRole` ENUM('TENANT_OWNER', 'TENANT_ADMIN', 'PIPELINE_MANAGER', 'WRITER', 'MEMBER', 'GUEST_PARTNER') NOT NULL DEFAULT 'TENANT_ADMIN',
    `requesterId` VARCHAR(191) NOT NULL,
    `approverId` VARCHAR(191) NULL,
    `rejectionReason` VARCHAR(191) NULL,
    `auditHash` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `executedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ApprovalRequest_tenantId_status_idx`(`tenantId`, `status`),
    INDEX `ApprovalRequest_requesterId_idx`(`requesterId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Feedback` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `workspaceSlug` VARCHAR(191) NULL,
    `category` ENUM('BUG', 'FEATURE_REQUEST', 'UX', 'PERFORMANCE', 'DATA_QUALITY', 'OTHER') NOT NULL,
    `impact` ENUM('BLOCKER', 'MAJOR', 'MINOR', 'IDEA') NOT NULL DEFAULT 'MINOR',
    `priority` ENUM('P0', 'P1', 'P2', 'P3') NOT NULL DEFAULT 'P3',
    `autoPriority` ENUM('P0', 'P1', 'P2', 'P3') NOT NULL DEFAULT 'P3',
    `status` ENUM('NEW', 'TRIAGED', 'IN_PROGRESS', 'RESOLVED', 'WONT_FIX') NOT NULL DEFAULT 'NEW',
    `title` VARCHAR(191) NOT NULL,
    `body` VARCHAR(191) NOT NULL,
    `triageReason` VARCHAR(191) NULL,
    `pageUrl` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `appVersion` VARCHAR(191) NULL,
    `locale` VARCHAR(191) NOT NULL DEFAULT 'tr',
    `screenshotKey` VARCHAR(191) NULL,
    `alertId` VARCHAR(191) NULL,
    `alertStatus` VARCHAR(191) NULL,
    `triageNote` VARCHAR(191) NULL,
    `triagedById` VARCHAR(191) NULL,
    `triagedAt` DATETIME(3) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Feedback_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    INDEX `Feedback_tenantId_status_priority_idx`(`tenantId`, `status`, `priority`),
    INDEX `Feedback_priority_status_idx`(`priority`, `status`),
    INDEX `Feedback_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Consent` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `kind` ENUM('DISCLOSURE_ACK', 'TERMS_ACCEPTANCE', 'EXPLICIT_CONSENT') NOT NULL,
    `purpose` ENUM('ACCOUNT_REGISTRATION', 'CALENDAR_OAUTH') NOT NULL,
    `documentId` VARCHAR(191) NOT NULL,
    `documentVersion` VARCHAR(191) NOT NULL,
    `locale` VARCHAR(191) NOT NULL DEFAULT 'tr',
    `grantedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `withdrawnAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Consent_tenantId_userId_purpose_idx`(`tenantId`, `userId`, `purpose`),
    INDEX `Consent_tenantId_purpose_documentVersion_idx`(`tenantId`, `purpose`, `documentVersion`),
    INDEX `Consent_userId_grantedAt_idx`(`userId`, `grantedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `InterregRubric` (
    `id` VARCHAR(191) NOT NULL,
    `programme` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `allowedMarks` JSON NOT NULL,
    `maxRaw` DECIMAL(6, 1) NOT NULL,
    `passRaw` DECIMAL(6, 1) NULL,
    `budgetMinMinor` INTEGER NULL,
    `budgetMaxMinor` INTEGER NULL,
    `currency` VARCHAR(191) NULL,
    `maxDurationMonths` INTEGER NULL,
    `source` JSON NOT NULL,
    `tieBreak` JSON NOT NULL,
    `programChecks` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `InterregRubric_programme_idx`(`programme`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `InterregRubricCriterion` (
    `id` VARCHAR(191) NOT NULL,
    `rubricId` VARCHAR(191) NOT NULL,
    `criterionKey` VARCHAR(191) NOT NULL,
    `officialRef` VARCHAR(191) NOT NULL,
    `section` VARCHAR(191) NOT NULL,
    `group` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `maxMark` DECIMAL(4, 1) NOT NULL,
    `knockoutBelow` DECIMAL(4, 1) NULL,
    `subQuestions` JSON NOT NULL,
    `afSections` JSON NOT NULL,
    `evidenceExpectation` LONGTEXT NULL,

    INDEX `InterregRubricCriterion_rubricId_position_idx`(`rubricId`, `position`),
    UNIQUE INDEX `InterregRubricCriterion_id_rubricId_key`(`id`, `rubricId`),
    UNIQUE INDEX `InterregRubricCriterion_rubricId_criterionKey_key`(`rubricId`, `criterionKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `InterregAnalysis` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `rubricId` VARCHAR(191) NOT NULL,
    `status` ENUM('UPLOADING', 'EXTRACTING', 'CALL_READY', 'READY', 'ANALYZING', 'DONE', 'FAILED') NOT NULL DEFAULT 'UPLOADING',
    `callFileName` VARCHAR(191) NULL,
    `callFormat` ENUM('PDF', 'DOCX', 'MD', 'TXT') NULL,
    `callPages` INTEGER NULL,
    `callChars` INTEGER NULL,
    `callText` LONGTEXT NULL,
    `callExtractedAt` DATETIME(3) NULL,
    `callTextExpiresAt` DATETIME(3) NULL,
    `projectFileName` VARCHAR(191) NULL,
    `projectFormat` ENUM('PDF', 'DOCX', 'MD', 'TXT') NULL,
    `projectPages` INTEGER NULL,
    `projectChars` INTEGER NULL,
    `projectText` LONGTEXT NULL,
    `projectExtractedAt` DATETIME(3) NULL,
    `projectTextExpiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `InterregAnalysis_tenantId_userId_createdAt_idx`(`tenantId`, `userId`, `createdAt`),
    INDEX `InterregAnalysis_rubricId_idx`(`rubricId`),
    UNIQUE INDEX `InterregAnalysis_id_tenantId_key`(`id`, `tenantId`),
    UNIQUE INDEX `InterregAnalysis_id_tenantId_rubricId_key`(`id`, `tenantId`, `rubricId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `InterregAnalysisResult` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `analysisId` VARCHAR(191) NOT NULL,
    `rawScore` DECIMAL(6, 1) NOT NULL,
    `score100` DECIMAL(4, 1) NOT NULL,
    `passesThresholds` BOOLEAN NOT NULL,
    `knockouts` JSON NOT NULL,
    `reportMarkdown` LONGTEXT NOT NULL,
    `redFlags` JSON NOT NULL,
    `improvements` JSON NOT NULL,
    `rewriteSample` JSON NOT NULL,
    `programChecks` JSON NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `promptHash` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `InterregAnalysisResult_analysisId_key`(`analysisId`),
    INDEX `InterregAnalysisResult_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `InterregAnalysisResult_analysisId_tenantId_key`(`analysisId`, `tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `InterregCriterionMark` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `analysisId` VARCHAR(191) NOT NULL,
    `rubricId` VARCHAR(191) NOT NULL,
    `criterionId` VARCHAR(191) NOT NULL,
    `mark` DECIMAL(4, 1) NOT NULL,
    `strengths` JSON NOT NULL,
    `weaknesses` JSON NOT NULL,
    `evidenceQuote` LONGTEXT NULL,
    `evidenceLocator` VARCHAR(191) NULL,
    `evidence` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InterregCriterionMark_tenantId_idx`(`tenantId`),
    INDEX `InterregCriterionMark_criterionId_idx`(`criterionId`),
    UNIQUE INDEX `InterregCriterionMark_analysisId_criterionId_key`(`analysisId`, `criterionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- AddForeignKey
ALTER TABLE `Tenant` ADD CONSTRAINT `Tenant_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgencyInviteCode` ADD CONSTRAINT `AgencyInviteCode_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Account` ADD CONSTRAINT `Account_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Membership` ADD CONSTRAINT `Membership_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Membership` ADD CONSTRAINT `Membership_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Workspace` ADD CONSTRAINT `Workspace_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TenantProfile` ADD CONSTRAINT `TenantProfile_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ModuleState` ADD CONSTRAINT `ModuleState_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlanVersion` ADD CONSTRAINT `PlanVersion_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `Plan`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `PlanFeature` ADD CONSTRAINT `PlanFeature_planVersionId_fkey` FOREIGN KEY (`planVersionId`) REFERENCES `PlanVersion`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `PlanAssignment` ADD CONSTRAINT `PlanAssignment_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `Plan`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `PlanAssignment` ADD CONSTRAINT `PlanAssignment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `Subscription` ADD CONSTRAINT `Subscription_planVersionId_fkey` FOREIGN KEY (`planVersionId`) REFERENCES `PlanVersion`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `Subscription` ADD CONSTRAINT `Subscription_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AddOn` ADD CONSTRAINT `AddOn_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Subscription`(`tenantId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LifetimeLicence` ADD CONSTRAINT `LifetimeLicence_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TenantBillingIdentity` ADD CONSTRAINT `TenantBillingIdentity_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CreditLedger` ADD CONSTRAINT `CreditLedger_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Call` ADD CONSTRAINT `Call_programmeId_fkey` FOREIGN KEY (`programmeId`) REFERENCES `Programme`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Topic` ADD CONSTRAINT `Topic_callId_fkey` FOREIGN KEY (`callId`) REFERENCES `Call`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TopicStat` ADD CONSTRAINT `TopicStat_topicId_fkey` FOREIGN KEY (`topicId`) REFERENCES `Topic`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TopicMatch` ADD CONSTRAINT `TopicMatch_topicId_fkey` FOREIGN KEY (`topicId`) REFERENCES `Topic`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TopicMatch` ADD CONSTRAINT `TopicMatch_opportunityId_fkey` FOREIGN KEY (`opportunityId`) REFERENCES `Opportunity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CordisParticipation` ADD CONSTRAINT `CordisParticipation_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `CordisProject`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CordisParticipation` ADD CONSTRAINT `CordisParticipation_organisationId_fkey` FOREIGN KEY (`organisationId`) REFERENCES `CordisOrganization`(`organisationId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CordisProjectTopic` ADD CONSTRAINT `CordisProjectTopic_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `CordisProject`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CordisProjectSciVoc` ADD CONSTRAINT `CordisProjectSciVoc_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `CordisProject`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CordisPartnerProfile` ADD CONSTRAINT `CordisPartnerProfile_organisationId_fkey` FOREIGN KEY (`organisationId`) REFERENCES `CordisOrganization`(`organisationId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerSearchAnnouncement` ADD CONSTRAINT `PartnerSearchAnnouncement_topicIdentifier_fkey` FOREIGN KEY (`topicIdentifier`) REFERENCES `Topic`(`identifier`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerSearchTopicStat` ADD CONSTRAINT `PartnerSearchTopicStat_topicIdentifier_fkey` FOREIGN KEY (`topicIdentifier`) REFERENCES `Topic`(`identifier`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerSearchQuotaUsage` ADD CONSTRAINT `PartnerSearchQuotaUsage_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Opportunity` ADD CONSTRAINT `Opportunity_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GateDecision` ADD CONSTRAINT `GateDecision_opportunityId_fkey` FOREIGN KEY (`opportunityId`) REFERENCES `Opportunity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsortiumSeat` ADD CONSTRAINT `ConsortiumSeat_opportunityId_fkey` FOREIGN KEY (`opportunityId`) REFERENCES `Opportunity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Proposal` ADD CONSTRAINT `Proposal_opportunityId_fkey` FOREIGN KEY (`opportunityId`) REFERENCES `Opportunity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Effort` ADD CONSTRAINT `Effort_opportunityId_fkey` FOREIGN KEY (`opportunityId`) REFERENCES `Opportunity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClaimEvidenceLink` ADD CONSTRAINT `ClaimEvidenceLink_claimId_fkey` FOREIGN KEY (`claimId`) REFERENCES `Claim`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClaimEvidenceLink` ADD CONSTRAINT `ClaimEvidenceLink_evidenceId_fkey` FOREIGN KEY (`evidenceId`) REFERENCES `Evidence`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProposalUsage` ADD CONSTRAINT `ProposalUsage_evidenceId_fkey` FOREIGN KEY (`evidenceId`) REFERENCES `Evidence`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Chunk` ADD CONSTRAINT `Chunk_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `Document`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditEvent` ADD CONSTRAINT `AuditEvent_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StripeEventLog` ADD CONSTRAINT `StripeEventLog_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Evaluation` ADD CONSTRAINT `Evaluation_opportunityId_fkey` FOREIGN KEY (`opportunityId`) REFERENCES `Opportunity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Evaluation` ADD CONSTRAINT `Evaluation_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `Proposal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Evaluation` ADD CONSTRAINT `Evaluation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reviewer` ADD CONSTRAINT `Reviewer_evaluationId_fkey` FOREIGN KEY (`evaluationId`) REFERENCES `Evaluation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reviewer` ADD CONSTRAINT `Reviewer_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Criterion` ADD CONSTRAINT `Criterion_evaluationId_fkey` FOREIGN KEY (`evaluationId`) REFERENCES `Evaluation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Score` ADD CONSTRAINT `Score_reviewerId_fkey` FOREIGN KEY (`reviewerId`) REFERENCES `Reviewer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Score` ADD CONSTRAINT `Score_criterionId_fkey` FOREIGN KEY (`criterionId`) REFERENCES `Criterion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MeetingBrief` ADD CONSTRAINT `MeetingBrief_opportunityId_fkey` FOREIGN KEY (`opportunityId`) REFERENCES `Opportunity`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FollowupDoc` ADD CONSTRAINT `FollowupDoc_opportunityId_fkey` FOREIGN KEY (`opportunityId`) REFERENCES `Opportunity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DualApprovalStep` ADD CONSTRAINT `DualApprovalStep_followupDocId_fkey` FOREIGN KEY (`followupDocId`) REFERENCES `FollowupDoc`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApplicationPart` ADD CONSTRAINT `ApplicationPart_opportunityId_fkey` FOREIGN KEY (`opportunityId`) REFERENCES `Opportunity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invitation` ADD CONSTRAINT `Invitation_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalRequest` ADD CONSTRAINT `ApprovalRequest_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalRequest` ADD CONSTRAINT `ApprovalRequest_requesterId_fkey` FOREIGN KEY (`requesterId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalRequest` ADD CONSTRAINT `ApprovalRequest_approverId_fkey` FOREIGN KEY (`approverId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InterregRubricCriterion` ADD CONSTRAINT `InterregRubricCriterion_rubricId_fkey` FOREIGN KEY (`rubricId`) REFERENCES `InterregRubric`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InterregAnalysis` ADD CONSTRAINT `InterregAnalysis_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InterregAnalysis` ADD CONSTRAINT `InterregAnalysis_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InterregAnalysis` ADD CONSTRAINT `InterregAnalysis_rubricId_fkey` FOREIGN KEY (`rubricId`) REFERENCES `InterregRubric`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InterregAnalysisResult` ADD CONSTRAINT `InterregAnalysisResult_analysisId_tenantId_fkey` FOREIGN KEY (`analysisId`, `tenantId`) REFERENCES `InterregAnalysis`(`id`, `tenantId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InterregCriterionMark` ADD CONSTRAINT `InterregCriterionMark_analysisId_tenantId_rubricId_fkey` FOREIGN KEY (`analysisId`, `tenantId`, `rubricId`) REFERENCES `InterregAnalysis`(`id`, `tenantId`, `rubricId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InterregCriterionMark` ADD CONSTRAINT `InterregCriterionMark_criterionId_rubricId_fkey` FOREIGN KEY (`criterionId`, `rubricId`) REFERENCES `InterregRubricCriterion`(`id`, `rubricId`) ON DELETE RESTRICT ON UPDATE CASCADE;

