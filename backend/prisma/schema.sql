-- -- ============================================================================
-- -- MARKOPS DATABASE SCHEMA BLUEPRINT
-- -- Target RDBMS: MySQL 8.0+ / MySQL Workbench
-- -- Description: Full DDL script for 27 operational tables supporting 
-- --              end-to-end marketing, design, ad sync, telecalling & revenue traceability.
-- --              Primary keys and foreign keys use INT AUTO_INCREMENT.
-- -- ============================================================================

-- CREATE DATABASE IF NOT EXISTS `markops` 
-- DEFAULT CHARACTER SET utf8mb4 
-- COLLATE utf8mb4_unicode_ci;

-- USE `markops`;

-- -- Disable foreign key checks for clean creation sequence
-- SET FOREIGN_KEY_CHECKS = 0;

-- -- ----------------------------------------------------------------------------
-- -- 1. SECURITY & ACCESS CONTROL MODULE
-- -- ----------------------------------------------------------------------------

-- -- Roles table
-- DROP TABLE IF EXISTS `roles`;
-- CREATE TABLE `roles` (
--   `id` INT NOT NULL AUTO_INCREMENT,
--   `name` VARCHAR(50) NOT NULL,
--   `code` VARCHAR(50) NOT NULL UNIQUE,
--   `description` VARCHAR(255) DEFAULT NULL,
--   `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
--   PRIMARY KEY (`id`)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -- Permissions table
-- DROP TABLE IF EXISTS `permissions`;
-- CREATE TABLE `permissions` (
--   `id` INT NOT NULL AUTO_INCREMENT,
--   `name` VARCHAR(100) NOT NULL,
--   `code` VARCHAR(100) NOT NULL UNIQUE,
--   `module` VARCHAR(50) NOT NULL,
--   `description` VARCHAR(255) DEFAULT NULL,
--   `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   PRIMARY KEY (`id`)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -- Role to Permission mapping
-- DROP TABLE IF EXISTS `role_permissions`;
-- CREATE TABLE `role_permissions` (
--   `role_id` INT NOT NULL,
--   `permission_id` INT NOT NULL,
--   `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   PRIMARY KEY (`role_id`, `permission_id`),
--   CONSTRAINT `fk_rp_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
--   CONSTRAINT `fk_rp_permission` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -- Teams table
-- DROP TABLE IF EXISTS `teams`;
-- CREATE TABLE `teams` (
--   `id` INT NOT NULL AUTO_INCREMENT,
--   `name` VARCHAR(100) NOT NULL,
--   `description` VARCHAR(255) DEFAULT NULL,
--   `manager_id` INT DEFAULT NULL,
--   `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
--   PRIMARY KEY (`id`)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -- Users table
-- DROP TABLE IF EXISTS `users`;
-- CREATE TABLE `users` (
--   `id` INT NOT NULL AUTO_INCREMENT,
--   `email` VARCHAR(191) NOT NULL UNIQUE,
--   `password_hash` VARCHAR(255) NOT NULL,
--   `full_name` VARCHAR(100) NOT NULL,
--   `role_id` INT NOT NULL,
--   `team_id` INT DEFAULT NULL,
--   `department` VARCHAR(100) DEFAULT NULL,
--   `is_active` TINYINT(1) NOT NULL DEFAULT 1,
--   `last_login_at` DATETIME DEFAULT NULL,
--   `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
--   PRIMARY KEY (`id`),
--   KEY `idx_users_role` (`role_id`),
--   KEY `idx_users_team` (`team_id`),
--   CONSTRAINT `fk_users_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`),
--   CONSTRAINT `fk_users_team` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`) ON DELETE SET NULL
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -- ----------------------------------------------------------------------------
-- -- 2. CAMPAIGNS & INTEGRATIONS MODULE
-- -- ----------------------------------------------------------------------------

-- -- Campaigns table
-- DROP TABLE IF EXISTS `campaigns`;
-- CREATE TABLE `campaigns` (
--   `id` INT NOT NULL AUTO_INCREMENT,
--   `name` VARCHAR(150) NOT NULL,
--   `objective` VARCHAR(100) NOT NULL,
--   `status` ENUM('PLANNING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED') NOT NULL DEFAULT 'PLANNING',
--   `start_date` DATE NOT NULL,
--   `end_date` DATE DEFAULT NULL,
--   `budget` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
--   `target_leads` INT NOT NULL DEFAULT 0,
--   `target_cpl` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
--   `target_qualified_pct` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
--   `target_conversion_pct` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
--   `owner_id` INT NOT NULL,
--   `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
--   PRIMARY KEY (`id`),
--   KEY `idx_campaigns_status` (`status`),
--   KEY `idx_campaigns_owner` (`owner_id`),
--   CONSTRAINT `fk_campaigns_owner` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -- Meta connections table
-- DROP TABLE IF EXISTS `meta_connections`;
-- CREATE TABLE `meta_connections` (
--   `id` INT NOT NULL AUTO_INCREMENT,
--   `account_name` VARCHAR(100) NOT NULL,
--   `ad_account_id` VARCHAR(100) NOT NULL UNIQUE,
--   `business_id` VARCHAR(100) DEFAULT NULL,
--   `access_token_encrypted` TEXT NOT NULL,
--   `token_expires_at` DATETIME DEFAULT NULL,
--   `status` ENUM('CONNECTED', 'EXPIRED', 'ERROR', 'DISCONNECTED') NOT NULL DEFAULT 'CONNECTED',
--   `last_synced_at` DATETIME DEFAULT NULL,
--   `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
--   PRIMARY KEY (`id`)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -- Meta sync logs table
-- DROP TABLE IF EXISTS `meta_sync_logs`;
-- CREATE TABLE `meta_sync_logs` (
--   `id` INT NOT NULL AUTO_INCREMENT,
--   `meta_connection_id` INT NOT NULL,
--   `sync_type` ENUM('MANUAL', 'SCHEDULED', 'WEBHOOK') NOT NULL DEFAULT 'SCHEDULED',
--   `status` ENUM('SUCCESS', 'FAILED', 'PARTIAL') NOT NULL,
--   `records_processed` INT NOT NULL DEFAULT 0,
--   `started_at` DATETIME NOT NULL,
--   `completed_at` DATETIME DEFAULT NULL,
--   `error_details` TEXT DEFAULT NULL,
--   PRIMARY KEY (`id`),
--   KEY `idx_sync_conn` (`meta_connection_id`),
--   CONSTRAINT `fk_sync_conn` FOREIGN KEY (`meta_connection_id`) REFERENCES `meta_connections` (`id`) ON DELETE CASCADE
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -- Ads table
-- DROP TABLE IF EXISTS `ads`;
-- CREATE TABLE `ads` (
--   `id` INT NOT NULL AUTO_INCREMENT,
--   `campaign_id` INT NOT NULL,
--   `meta_connection_id` INT DEFAULT NULL,
--   `platform_ad_id` VARCHAR(100) DEFAULT NULL,
--   `platform_adset_id` VARCHAR(100) DEFAULT NULL,
--   `platform_campaign_id` VARCHAR(100) DEFAULT NULL,
--   `name` VARCHAR(150) NOT NULL,
--   `status` ENUM('ACTIVE', 'PAUSED', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
--   `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
--   PRIMARY KEY (`id`),
--   KEY `idx_ads_campaign` (`campaign_id`),
--   KEY `idx_ads_meta` (`meta_connection_id`),
--   CONSTRAINT `fk_ads_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE CASCADE,
--   CONSTRAINT `fk_ads_meta` FOREIGN KEY (`meta_connection_id`) REFERENCES `meta_connections` (`id`) ON DELETE SET NULL
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -- Ad metrics snapshot table
-- DROP TABLE IF EXISTS `ad_metrics`;
-- CREATE TABLE `ad_metrics` (
--   `id` INT NOT NULL AUTO_INCREMENT,
--   `ad_id` INT NOT NULL,
--   `spend` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
--   `impressions` BIGINT NOT NULL DEFAULT 0,
--   `reach` BIGINT NOT NULL DEFAULT 0,
--   `clicks` INT NOT NULL DEFAULT 0,
--   `ctr` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
--   `cpc` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
--   `leads_count` INT NOT NULL DEFAULT 0,
--   `cpl` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
--   `snapshot_date` DATE NOT NULL,
--   `recorded_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   PRIMARY KEY (`id`),
--   KEY `idx_metrics_ad` (`ad_id`),
--   KEY `idx_metrics_date` (`snapshot_date`),
--   CONSTRAINT `fk_metrics_ad` FOREIGN KEY (`ad_id`) REFERENCES `ads` (`id`) ON DELETE CASCADE
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -- ----------------------------------------------------------------------------
-- -- 3. TASK & CREATIVE MANAGEMENT MODULE
-- -- ----------------------------------------------------------------------------

-- -- Tasks table
-- CREATE TABLE `tasks` (
--   `id` INT NOT NULL AUTO_INCREMENT,

--   `campaign_id` INT DEFAULT NULL,

--   `title` VARCHAR(150) NOT NULL,

--   `description` TEXT DEFAULT NULL,

--   `status` ENUM(
--     'ASSIGNED',
--     'ACCEPTED',
--     'IN_PROGRESS',
--     'SUBMITTED',
--     'REDESIGN_REQUIRED',
--     'APPROVED'
--   ) NOT NULL DEFAULT 'ASSIGNED',

--   `priority` ENUM(
--     'LOW',
--     'MEDIUM',
--     'HIGH',
--     'URGENT'
--   ) NOT NULL DEFAULT 'MEDIUM',

--   `created_by` INT NOT NULL,

--   `assigned_to` INT DEFAULT NULL,

--   `due_date` DATE DEFAULT NULL,

--   `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
--   `package_name` VARCHAR(100) DEFAULT 'Careermate',
--   `attachment_url` LONGTEXT DEFAULT NULL,
--   `attachment_name` VARCHAR(255) DEFAULT NULL,
--   `content` LONGTEXT DEFAULT NULL,
--   `reviewer_feedback` TEXT DEFAULT NULL,
--   PRIMARY KEY (`id`),

--   KEY `idx_tasks_campaign` (`campaign_id`),
--   KEY `idx_tasks_assigned` (`assigned_to`),
--   KEY `idx_tasks_status` (`status`),

--   CONSTRAINT `fk_tasks_campaign`
--     FOREIGN KEY (`campaign_id`)
--     REFERENCES `campaigns` (`id`)
--     ON DELETE SET NULL,

--   CONSTRAINT `fk_tasks_creator`
--     FOREIGN KEY (`created_by`)
--     REFERENCES `users` (`id`),

--   CONSTRAINT `fk_tasks_assignee`
--     FOREIGN KEY (`assigned_to`)
--     REFERENCES `users` (`id`)
--     ON DELETE SET NULL

-- ) ENGINE=InnoDB
-- DEFAULT CHARSET=utf8mb4
-- COLLATE=utf8mb4_unicode_ci;

-- -- Task assignments history
-- DROP TABLE IF EXISTS `task_assignments`;
-- CREATE TABLE `task_assignments` (
--   `id` INT NOT NULL AUTO_INCREMENT,
--   `task_id` INT NOT NULL,
--   `assigned_by` INT NOT NULL,
--   `assigned_to` INT NOT NULL,
--   `assigned_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   `unassigned_at` DATETIME DEFAULT NULL,
--   PRIMARY KEY (`id`),
--   KEY `idx_ta_task` (`task_id`),
--   CONSTRAINT `fk_ta_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -- Task status history
-- DROP TABLE IF EXISTS `task_status_history`;
-- CREATE TABLE `task_status_history` (
--   `id` INT NOT NULL AUTO_INCREMENT,
--   `task_id` INT NOT NULL,
--   `actor_id` INT NOT NULL,
--   `previous_status` VARCHAR(50) DEFAULT NULL,
--   `new_status` VARCHAR(50) NOT NULL,
--   `remark` TEXT DEFAULT NULL,
--   `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   PRIMARY KEY (`id`),
--   KEY `idx_tsh_task` (`task_id`),
--   CONSTRAINT `fk_tsh_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -- Task progress history
-- DROP TABLE IF EXISTS `task_progress_history`;
-- CREATE TABLE `task_progress_history` (
--   `id` INT NOT NULL AUTO_INCREMENT,
--   `task_id` INT NOT NULL,
--   `actor_id` INT NOT NULL,
--   `progress_percent` INT NOT NULL DEFAULT 0,
--   `notes` TEXT DEFAULT NULL,
--   `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   PRIMARY KEY (`id`),
--   KEY `idx_tph_task` (`task_id`),
--   CONSTRAINT `fk_tph_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -- Task creative versions
-- DROP TABLE IF EXISTS `task_versions`;
-- CREATE TABLE `task_versions` (
--   `id` INT NOT NULL AUTO_INCREMENT,
--   `task_id` INT NOT NULL,
--   `version_number` INT NOT NULL DEFAULT 1,
--   `submitted_by` INT NOT NULL,
--   `file_name` VARCHAR(255) NOT NULL,
--   `file_path` VARCHAR(500) NOT NULL,
--   `storage_key` VARCHAR(255) NOT NULL,
--   `file_size` BIGINT NOT NULL,
--   `mime_type` VARCHAR(100) NOT NULL,
--   `changelog` TEXT DEFAULT NULL,
--   `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   PRIMARY KEY (`id`),
--   KEY `idx_tv_task` (`task_id`),
--   CONSTRAINT `fk_tv_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -- Task discussion comments
-- DROP TABLE IF EXISTS `task_comments`;
-- CREATE TABLE `task_comments` (
--   `id` INT NOT NULL AUTO_INCREMENT,
--   `task_id` INT NOT NULL,
--   `user_id` INT NOT NULL,
--   `comment` TEXT NOT NULL,
--   `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   PRIMARY KEY (`id`),
--   KEY `idx_tc_task` (`task_id`),
--   CONSTRAINT `fk_tc_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -- Task attachments
-- DROP TABLE IF EXISTS `task_attachments`;
-- CREATE TABLE `task_attachments` (
--   `id` INT NOT NULL AUTO_INCREMENT,
--   `task_id` INT NOT NULL,
--   `file_name` VARCHAR(255) NOT NULL,
--   `file_path` VARCHAR(500) NOT NULL,
--   `file_size` BIGINT NOT NULL,
--   `uploaded_by` INT NOT NULL,
--   `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   PRIMARY KEY (`id`),
--   KEY `idx_att_task` (`task_id`),
--   CONSTRAINT `fk_att_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -- ----------------------------------------------------------------------------
-- -- 4. LEADS & TELECALLING PIPELINE MODULE
-- -- ----------------------------------------------------------------------------

-- -- Leads table
-- DROP TABLE IF EXISTS `leads`;
-- CREATE TABLE `leads` (
--   `id` INT NOT NULL AUTO_INCREMENT,
--   `first_name` VARCHAR(100) NOT NULL,
--   `last_name` VARCHAR(100) DEFAULT NULL,
--   `email` VARCHAR(191) DEFAULT NULL,
--   `phone` VARCHAR(30) NOT NULL,
--   `source` VARCHAR(100) NOT NULL DEFAULT 'META_ADS',
--   `campaign_id` INT DEFAULT NULL,
--   `ad_id` INT DEFAULT NULL,
--   `status` ENUM('NEW', 'ASSIGNED', 'CONTACTED', 'INTERESTED', 'NOT_INTERESTED', 'QUALIFIED', 'CONVERTED', 'LOST') NOT NULL DEFAULT 'NEW',
--   `assigned_to` INT DEFAULT NULL,
--   `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
--   PRIMARY KEY (`id`),
--   KEY `idx_leads_phone` (`phone`),
--   KEY `idx_leads_email` (`email`),
--   KEY `idx_leads_status` (`status`),
--   KEY `idx_leads_assigned` (`assigned_to`),
--   KEY `idx_leads_campaign` (`campaign_id`),
--   CONSTRAINT `fk_leads_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE SET NULL,
--   CONSTRAINT `fk_leads_ad` FOREIGN KEY (`ad_id`) REFERENCES `ads` (`id`) ON DELETE SET NULL,
--   CONSTRAINT `fk_leads_assignee` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -- Lead assignment history
-- DROP TABLE IF EXISTS `lead_assignments`;
-- CREATE TABLE `lead_assignments` (
--   `id` INT NOT NULL AUTO_INCREMENT,
--   `lead_id` INT NOT NULL,
--   `assigned_by` INT NOT NULL,
--   `assigned_to` INT NOT NULL,
--   `assigned_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   PRIMARY KEY (`id`),
--   KEY `idx_la_lead` (`lead_id`),
--   CONSTRAINT `fk_la_lead` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -- Lead status history
-- DROP TABLE IF EXISTS `lead_status_history`;
-- CREATE TABLE `lead_status_history` (
--   `id` INT NOT NULL AUTO_INCREMENT,
--   `lead_id` INT NOT NULL,
--   `actor_id` INT NOT NULL,
--   `previous_status` VARCHAR(50) DEFAULT NULL,
--   `new_status` VARCHAR(50) NOT NULL,
--   `reason` TEXT DEFAULT NULL,
--   `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   PRIMARY KEY (`id`),
--   KEY `idx_lsh_lead` (`lead_id`),
--   CONSTRAINT `fk_lsh_lead` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -- Call activities table
-- DROP TABLE IF EXISTS `call_activities`;
-- CREATE TABLE `call_activities` (
--   `id` INT NOT NULL AUTO_INCREMENT,
--   `lead_id` INT NOT NULL,
--   `telecaller_id` INT NOT NULL,
--   `outcome` ENUM('CONNECTED', 'NO_ANSWER', 'BUSY', 'WRONG_NUMBER', 'INTERESTED', 'NOT_INTERESTED', 'QUALIFIED') NOT NULL,
--   `duration_seconds` INT NOT NULL DEFAULT 0,
--   `remarks` TEXT DEFAULT NULL,
--   `next_action` VARCHAR(255) DEFAULT NULL,
--   `called_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   PRIMARY KEY (`id`),
--   KEY `idx_ca_lead` (`lead_id`),
--   KEY `idx_ca_caller` (`telecaller_id`),
--   CONSTRAINT `fk_ca_lead` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE,
--   CONSTRAINT `fk_ca_caller` FOREIGN KEY (`telecaller_id`) REFERENCES `users` (`id`)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -- Follow ups table
-- DROP TABLE IF EXISTS `follow_ups`;
-- CREATE TABLE `follow_ups` (
--   `id` INT NOT NULL AUTO_INCREMENT,
--   `lead_id` INT NOT NULL,
--   `telecaller_id` INT NOT NULL,
--   `due_date` DATETIME NOT NULL,
--   `status` ENUM('PENDING', 'COMPLETED', 'OVERDUE', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
--   `notes` TEXT DEFAULT NULL,
--   `completed_at` DATETIME DEFAULT NULL,
--   `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   PRIMARY KEY (`id`),
--   KEY `idx_fu_lead` (`lead_id`),
--   KEY `idx_fu_caller` (`telecaller_id`),
--   KEY `idx_fu_due` (`due_date`, `status`),
--   CONSTRAINT `fk_fu_lead` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE,
--   CONSTRAINT `fk_fu_caller` FOREIGN KEY (`telecaller_id`) REFERENCES `users` (`id`)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -- ----------------------------------------------------------------------------
-- -- 5. CONVERSIONS & FINANCIAL TRANSACTIONS MODULE
-- -- ----------------------------------------------------------------------------

-- -- Conversions table
-- DROP TABLE IF EXISTS `conversions`;
-- CREATE TABLE `conversions` (
--   `id` INT NOT NULL AUTO_INCREMENT,
--   `lead_id` INT NOT NULL UNIQUE,
--   `campaign_id` INT DEFAULT NULL,
--   `confirmed_by` INT NOT NULL,
--   `converted_value` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
--   `notes` TEXT DEFAULT NULL,
--   `converted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   PRIMARY KEY (`id`),
--   KEY `idx_conv_campaign` (`campaign_id`),
--   CONSTRAINT `fk_conv_lead` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE,
--   CONSTRAINT `fk_conv_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE SET NULL,
--   CONSTRAINT `fk_conv_user` FOREIGN KEY (`confirmed_by`) REFERENCES `users` (`id`)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -- Transactions table
-- DROP TABLE IF EXISTS `transactions`;
-- CREATE TABLE `transactions` (
--   `id` INT NOT NULL AUTO_INCREMENT,
--   `conversion_id` INT NOT NULL,
--   `lead_id` INT NOT NULL,
--   `amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
--   `payment_status` ENUM('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'COMPLETED',
--   `payment_method` VARCHAR(50) NOT NULL DEFAULT 'CREDIT_CARD',
--   `transaction_ref` VARCHAR(100) NOT NULL UNIQUE,
--   `recorded_by` INT NOT NULL,
--   `transaction_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   PRIMARY KEY (`id`),
--   KEY `idx_tx_conv` (`conversion_id`),
--   KEY `idx_tx_lead` (`lead_id`),
--   CONSTRAINT `fk_tx_conv` FOREIGN KEY (`conversion_id`) REFERENCES `conversions` (`id`) ON DELETE CASCADE,
--   CONSTRAINT `fk_tx_lead` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE,
--   CONSTRAINT `fk_tx_user` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`id`)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -- ----------------------------------------------------------------------------
-- -- 6. SYSTEM AUDIT & DAILY METRICS MODULE
-- -- ----------------------------------------------------------------------------

-- -- User notifications table
-- DROP TABLE IF EXISTS `notifications`;
-- CREATE TABLE `notifications` (
--   `id` INT NOT NULL AUTO_INCREMENT,
--   `user_id` INT NOT NULL,
--   `title` VARCHAR(150) NOT NULL,
--   `message` TEXT NOT NULL,
--   `type` ENUM('INFO', 'SUCCESS', 'WARNING', 'ALERT') NOT NULL DEFAULT 'INFO',
--   `is_read` TINYINT(1) NOT NULL DEFAULT 0,
--   `read_at` DATETIME DEFAULT NULL,
--   `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   PRIMARY KEY (`id`),
--   KEY `idx_notif_user` (`user_id`, `is_read`),
--   CONSTRAINT `fk_notif_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -- System Audit logs table
-- DROP TABLE IF EXISTS `audit_logs`;
-- CREATE TABLE `audit_logs` (
--   `id` INT NOT NULL AUTO_INCREMENT,
--   `actor_id` INT DEFAULT NULL,
--   `action` VARCHAR(100) NOT NULL,
--   `entity_type` VARCHAR(100) NOT NULL,
--   `entity_id` VARCHAR(100) NOT NULL,
--   `previous_state` JSON DEFAULT NULL,
--   `new_state` JSON DEFAULT NULL,
--   `ip_address` VARCHAR(45) DEFAULT NULL,
--   `user_agent` VARCHAR(255) DEFAULT NULL,
--   `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   PRIMARY KEY (`id`),
--   KEY `idx_audit_actor` (`actor_id`),
--   KEY `idx_audit_entity` (`entity_type`, `entity_id`),
--   CONSTRAINT `fk_audit_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -- Aggregated Daily Performance metrics table
-- DROP TABLE IF EXISTS `daily_performance`;
-- CREATE TABLE `daily_performance` (
--   `id` INT NOT NULL AUTO_INCREMENT,
--   `metric_date` DATE NOT NULL UNIQUE,
--   `total_spend` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
--   `total_leads` INT NOT NULL DEFAULT 0,
--   `qualified_leads` INT NOT NULL DEFAULT 0,
--   `conversions` INT NOT NULL DEFAULT 0,
--   `total_revenue` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
--   `avg_cpl` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
--   `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   PRIMARY KEY (`id`),
--   KEY `idx_dp_date` (`metric_date`)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -- 8. PRODUCT PACKAGES MODULE
-- DROP TABLE IF EXISTS `packages`;
-- CREATE TABLE `packages` (
--   `id` INT NOT NULL AUTO_INCREMENT,
--   `product_id` VARCHAR(100) NOT NULL,
--   `name` VARCHAR(255) NOT NULL,
--   `image_url` LONGTEXT DEFAULT NULL,
--   `price` DECIMAL(10,2) DEFAULT NULL,
--   `description` TEXT DEFAULT NULL,
--   `status` VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
--   `created_by` INT DEFAULT NULL,
--   `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
--   PRIMARY KEY (`id`),
--   KEY `idx_packages_product` (`product_id`)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -- Re-enable foreign key checks
-- SET FOREIGN_KEY_CHECKS = 1;

-- -- ============================================================================
-- -- PRODUCTION SEED DATA (ROLES, TEAMS & DEFAULT USERS)
-- -- ============================================================================

-- -- ============================================================================
-- -- MARKOPS PRODUCTION SEED DATA SCRIPT
-- -- Target RDBMS: MySQL 8.0+ / MySQL Workbench
-- -- Description: Inserts system roles and 1 primary Administrator user with INT IDs.
-- -- ============================================================================

-- USE `markops`;

-- SET FOREIGN_KEY_CHECKS = 0;

-- -- Clear all user and operational table records
-- TRUNCATE TABLE `transactions`;
-- TRUNCATE TABLE `conversions`;
-- TRUNCATE TABLE `follow_ups`;
-- TRUNCATE TABLE `call_activities`;
-- TRUNCATE TABLE `lead_status_history`;
-- TRUNCATE TABLE `lead_assignments`;
-- TRUNCATE TABLE `leads`;
-- TRUNCATE TABLE `task_attachments`;
-- TRUNCATE TABLE `task_comments`;
-- TRUNCATE TABLE `task_versions`;
-- TRUNCATE TABLE `task_progress_history`;
-- TRUNCATE TABLE `task_status_history`;
-- TRUNCATE TABLE `task_assignments`;
-- TRUNCATE TABLE `tasks`;
-- TRUNCATE TABLE `ad_metrics`;
-- TRUNCATE TABLE `ads`;
-- TRUNCATE TABLE `meta_sync_logs`;
-- TRUNCATE TABLE `meta_connections`;
-- TRUNCATE TABLE `campaigns`;
-- TRUNCATE TABLE `users`;
-- TRUNCATE TABLE `teams`;
-- TRUNCATE TABLE `role_permissions`;
-- TRUNCATE TABLE `permissions`;
-- TRUNCATE TABLE `roles`;

-- -- 1. Insert System Roles
-- INSERT INTO `roles` (`id`, `name`, `code`, `description`) VALUES
-- (1, 'Administrator', 'ADMINISTRATOR', 'Full System Access'),
-- (2, 'Marketing Manager', 'MARKETING_MANAGER', 'Campaign Operations'),
-- (3, 'Digital Marketing', 'DIGITAL_MARKETING', 'Ad Operations'),
-- (4, 'Designer', 'DESIGNER', 'Asset Design'),
-- (5, 'Telecaller', 'TELECALLER', 'Lead Telecalling'),
-- (6, 'Business Development Manager', 'BDM', 'Package Task Management & Designer Collaboration');

-- -- 2. Insert Core Team
-- INSERT INTO `teams` (`id`, `name`, `description`) VALUES
-- (1, 'System Administration', 'Core administrative operations');

-- -- 3. Insert Ready-to-Use User Accounts (Password for all accounts is: admin123)
-- -- Bcrypt Hash: $2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQOEg6Lruj3BoB6tK3y/G
-- INSERT INTO `users` (`id`, `email`, `password_hash`, `full_name`, `role_id`, `team_id`, `department`, `is_active`) VALUES
-- (1, 'admin@markops.io', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQOEg6Lruj3BoB6tK3y/G', 'System Administrator', 1, 1, 'Executive Operations', 1)
-- SET FOREIGN_KEY_CHECKS = 1;


----------------------version 2-----------------------------

-- ============================================================================
-- MARKOPS DATABASE SCHEMA BLUEPRINT & PRODUCTION SEED DATA
-- Target RDBMS: MySQL 8.0+ / MySQL Workbench
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `markops` 
DEFAULT CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE `markops`;

-- Disable foreign key checks for clean creation sequence
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------------------------
-- 1. SECURITY & ACCESS CONTROL MODULE
-- ----------------------------------------------------------------------------

DROP TABLE IF EXISTS `role_permissions`;
DROP TABLE IF EXISTS `permissions`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `teams`;
DROP TABLE IF EXISTS `roles`;

-- Roles table
CREATE TABLE `roles` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(50) NOT NULL,
  `code` VARCHAR(50) NOT NULL UNIQUE,
  `description` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Permissions table
CREATE TABLE `permissions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `code` VARCHAR(100) NOT NULL UNIQUE,
  `module` VARCHAR(50) NOT NULL,
  `description` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Role to Permission mapping
CREATE TABLE `role_permissions` (
  `role_id` INT NOT NULL,
  `permission_id` INT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_id`, `permission_id`),
  CONSTRAINT `fk_rp_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rp_permission` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Teams table
CREATE TABLE `teams` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `description` VARCHAR(255) DEFAULT NULL,
  `manager_id` INT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Users table
CREATE TABLE `users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(191) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `full_name` VARCHAR(100) NOT NULL,
  `role_id` INT NOT NULL,
  `team_id` INT DEFAULT NULL,
  `department` VARCHAR(100) DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `last_login_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_users_role` (`role_id`),
  KEY `idx_users_team` (`team_id`),
  CONSTRAINT `fk_users_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`),
  CONSTRAINT `fk_users_team` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. CAMPAIGNS & INTEGRATIONS MODULE
-- ----------------------------------------------------------------------------

DROP TABLE IF EXISTS `ad_metrics`;
DROP TABLE IF EXISTS `ads`;
DROP TABLE IF EXISTS `meta_sync_logs`;
DROP TABLE IF EXISTS `meta_connections`;
DROP TABLE IF EXISTS `campaigns`;

-- Campaigns table
CREATE TABLE `campaigns` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(150) NOT NULL,
  `objective` VARCHAR(100) NOT NULL,
  `status` ENUM('PLANNING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED') NOT NULL DEFAULT 'PLANNING',
  `start_date` DATE NOT NULL,
  `end_date` DATE DEFAULT NULL,
  `budget` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `spend` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `leads_count` INT NOT NULL DEFAULT 0,
  `target_leads` INT NOT NULL DEFAULT 0,
  `target_cpl` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `target_qualified_pct` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `target_conversion_pct` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `owner_id` INT NOT NULL,
  `meta_campaign_id` VARCHAR(100) DEFAULT NULL,
  `clicks` INT NOT NULL DEFAULT 0,
  `impressions` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_campaigns_status` (`status`),
  KEY `idx_campaigns_owner` (`owner_id`),
  UNIQUE KEY `uq_campaigns_meta_campaign_id` (`meta_campaign_id`),
  CONSTRAINT `fk_campaigns_owner` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Meta connections table
CREATE TABLE `meta_connections` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `account_name` VARCHAR(100) NOT NULL,
  `ad_account_id` VARCHAR(100) NOT NULL UNIQUE,
  `business_id` VARCHAR(100) DEFAULT NULL,
  `access_token_encrypted` TEXT NOT NULL,
  `token_expires_at` DATETIME DEFAULT NULL,
  `status` ENUM('CONNECTED', 'EXPIRED', 'ERROR', 'DISCONNECTED') NOT NULL DEFAULT 'CONNECTED',
  `last_synced_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Meta sync logs table
CREATE TABLE `meta_sync_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `meta_connection_id` INT NOT NULL,
  `sync_type` ENUM('MANUAL', 'SCHEDULED', 'WEBHOOK') NOT NULL DEFAULT 'SCHEDULED',
  `status` ENUM('SUCCESS', 'FAILED', 'PARTIAL') NOT NULL,
  `records_processed` INT NOT NULL DEFAULT 0,
  `started_at` DATETIME NOT NULL,
  `completed_at` DATETIME DEFAULT NULL,
  `error_details` TEXT DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sync_conn` (`meta_connection_id`),
  CONSTRAINT `fk_sync_conn` FOREIGN KEY (`meta_connection_id`) REFERENCES `meta_connections` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `meta_webhook_events` (
  `meta_lead_id` VARCHAR(100) NOT NULL,
  `form_id` VARCHAR(100) DEFAULT NULL,
  `page_id` VARCHAR(100) DEFAULT NULL,
  `ad_id` VARCHAR(100) DEFAULT NULL,
  `campaign_id` VARCHAR(100) DEFAULT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  `attempts` INT NOT NULL DEFAULT 0,
  `last_error` TEXT DEFAULT NULL,
  `next_attempt_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`meta_lead_id`),
  KEY `idx_meta_webhook_status_next_attempt` (`status`, `next_attempt_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ads table
CREATE TABLE `ads` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `campaign_id` INT NOT NULL,
  `meta_connection_id` INT DEFAULT NULL,
  `platform_ad_id` VARCHAR(100) DEFAULT NULL,
  `platform_adset_id` VARCHAR(100) DEFAULT NULL,
  `platform_campaign_id` VARCHAR(100) DEFAULT NULL,
  `name` VARCHAR(150) NOT NULL,
  `platform` VARCHAR(50) DEFAULT 'Meta',
  `spend` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `impressions` INT NOT NULL DEFAULT 0,
  `clicks` INT NOT NULL DEFAULT 0,
  `leads_count` INT NOT NULL DEFAULT 0,
  `status` ENUM('ACTIVE', 'PAUSED', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ads_campaign` (`campaign_id`),
  KEY `idx_ads_meta` (`meta_connection_id`),
  UNIQUE KEY `uq_ads_platform_ad_id` (`platform_ad_id`),
  KEY `idx_ads_platform_campaign_id` (`platform_campaign_id`),
  CONSTRAINT `fk_ads_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ads_meta` FOREIGN KEY (`meta_connection_id`) REFERENCES `meta_connections` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ad metrics snapshot table
CREATE TABLE `ad_metrics` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `ad_id` INT NOT NULL,
  `spend` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `impressions` BIGINT NOT NULL DEFAULT 0,
  `reach` BIGINT NOT NULL DEFAULT 0,
  `clicks` INT NOT NULL DEFAULT 0,
  `ctr` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `cpc` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `leads_count` INT NOT NULL DEFAULT 0,
  `cpl` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `snapshot_date` DATE NOT NULL,
  `recorded_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_metrics_ad` (`ad_id`),
  KEY `idx_metrics_date` (`snapshot_date`),
  CONSTRAINT `fk_metrics_ad` FOREIGN KEY (`ad_id`) REFERENCES `ads` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. TASK & CREATIVE MANAGEMENT MODULE
-- ----------------------------------------------------------------------------

DROP TABLE IF EXISTS `task_attachments`;
DROP TABLE IF EXISTS `task_comments`;
DROP TABLE IF EXISTS `task_versions`;
DROP TABLE IF EXISTS `task_progress_history`;
DROP TABLE IF EXISTS `task_status_history`;
DROP TABLE IF EXISTS `task_assignments`;
DROP TABLE IF EXISTS `tasks`;

-- Tasks table
CREATE TABLE `tasks` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `campaign_id` INT DEFAULT NULL,
  `title` VARCHAR(150) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `status` ENUM('ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED', 'REDESIGN_REQUIRED', 'APPROVED') NOT NULL DEFAULT 'ASSIGNED',
  `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
  `created_by` INT NOT NULL,
  `assigned_to` INT DEFAULT NULL,
  `due_date` DATE DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `package_name` VARCHAR(100) DEFAULT 'Careermate',
  `attachment_url` LONGTEXT DEFAULT NULL,
  `attachment_name` VARCHAR(255) DEFAULT NULL,
  `content` LONGTEXT DEFAULT NULL,
  `reviewer_feedback` TEXT DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tasks_campaign` (`campaign_id`),
  KEY `idx_tasks_assigned` (`assigned_to`),
  KEY `idx_tasks_status` (`status`),
  CONSTRAINT `fk_tasks_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_tasks_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_tasks_assignee` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Task assignments history
CREATE TABLE `task_assignments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `task_id` INT NOT NULL,
  `assigned_by` INT NOT NULL,
  `assigned_to` INT NOT NULL,
  `assigned_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `unassigned_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ta_task` (`task_id`),
  CONSTRAINT `fk_ta_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Task status history
CREATE TABLE `task_status_history` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `task_id` INT NOT NULL,
  `actor_id` INT NOT NULL,
  `previous_status` VARCHAR(50) DEFAULT NULL,
  `new_status` VARCHAR(50) NOT NULL,
  `remark` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tsh_task` (`task_id`),
  CONSTRAINT `fk_tsh_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Task progress history
CREATE TABLE `task_progress_history` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `task_id` INT NOT NULL,
  `actor_id` INT NOT NULL,
  `progress_percent` INT NOT NULL DEFAULT 0,
  `notes` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tph_task` (`task_id`),
  CONSTRAINT `fk_tph_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Task creative versions
CREATE TABLE `task_versions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `task_id` INT NOT NULL,
  `version_number` INT NOT NULL DEFAULT 1,
  `submitted_by` INT NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `file_path` VARCHAR(500) NOT NULL,
  `storage_key` VARCHAR(255) NOT NULL,
  `file_size` BIGINT NOT NULL,
  `mime_type` VARCHAR(100) NOT NULL,
  `changelog` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tv_task` (`task_id`),
  CONSTRAINT `fk_tv_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Task discussion comments
CREATE TABLE `task_comments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `task_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `comment` TEXT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tc_task` (`task_id`),
  CONSTRAINT `fk_tc_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Task attachments
CREATE TABLE `task_attachments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `task_id` INT NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `file_path` VARCHAR(500) NOT NULL,
  `file_size` BIGINT NOT NULL,
  `uploaded_by` INT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_att_task` (`task_id`),
  CONSTRAINT `fk_att_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. LEADS & TELECALLING PIPELINE MODULE
-- ----------------------------------------------------------------------------

DROP TABLE IF EXISTS `follow_ups`;
DROP TABLE IF EXISTS `call_activities`;
DROP TABLE IF EXISTS `lead_status_history`;
DROP TABLE IF EXISTS `lead_assignments`;
DROP TABLE IF EXISTS `leads`;

-- Leads table
CREATE TABLE `leads` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) DEFAULT NULL,
  `email` VARCHAR(191) DEFAULT NULL,
  `phone` VARCHAR(30) NOT NULL,
  `source` VARCHAR(100) NOT NULL DEFAULT 'META_ADS',
  `campaign_id` INT DEFAULT NULL,
  `ad_id` INT DEFAULT NULL,
  `status` ENUM('NEW', 'ASSIGNED', 'CONTACTED', 'INTERESTED', 'NOT_INTERESTED', 'QUALIFIED', 'CONVERTED', 'LOST') NOT NULL DEFAULT 'NEW',
  `assigned_to` INT DEFAULT NULL,
  `assigned_telecaller_id` INT DEFAULT NULL,
  `assignment_status` VARCHAR(30) NOT NULL DEFAULT 'UNASSIGNED',
  `call_disposition` VARCHAR(100) DEFAULT NULL,
  `meta_lead_id` VARCHAR(100) DEFAULT NULL,
  `meta_campaign_id` VARCHAR(100) DEFAULT NULL,
  `meta_ad_id` VARCHAR(100) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_leads_phone` (`phone`),
  KEY `idx_leads_email` (`email`),
  KEY `idx_leads_status` (`status`),
  KEY `idx_leads_assigned` (`assigned_to`),
  KEY `idx_leads_assigned_telecaller_id` (`assigned_telecaller_id`),
  KEY `idx_leads_campaign` (`campaign_id`),
  UNIQUE KEY `uq_leads_meta_lead_id` (`meta_lead_id`),
  KEY `idx_leads_meta_campaign_id` (`meta_campaign_id`),
  KEY `idx_leads_meta_ad_id` (`meta_ad_id`),
  CONSTRAINT `fk_leads_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_leads_ad` FOREIGN KEY (`ad_id`) REFERENCES `ads` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_leads_meta_campaign` FOREIGN KEY (`meta_campaign_id`) REFERENCES `campaigns` (`meta_campaign_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_leads_meta_ad` FOREIGN KEY (`meta_ad_id`) REFERENCES `ads` (`platform_ad_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_leads_assignee` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_leads_assigned_telecaller` FOREIGN KEY (`assigned_telecaller_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Lead assignment history
CREATE TABLE `lead_assignments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `lead_id` INT NOT NULL,
  `assigned_by` INT NOT NULL,
  `assigned_to` INT NOT NULL,
  `assigned_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_la_lead` (`lead_id`),
  CONSTRAINT `fk_la_lead` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Lead status history
CREATE TABLE `lead_status_history` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `lead_id` INT NOT NULL,
  `actor_id` INT NOT NULL,
  `previous_status` VARCHAR(50) DEFAULT NULL,
  `new_status` VARCHAR(50) NOT NULL,
  `reason` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_lsh_lead` (`lead_id`),
  CONSTRAINT `fk_lsh_lead` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Call activities table
CREATE TABLE `call_activities` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `lead_id` INT NOT NULL,
  `telecaller_id` INT NOT NULL,
  `outcome` ENUM('CONNECTED', 'NO_ANSWER', 'BUSY', 'WRONG_NUMBER', 'INTERESTED', 'NOT_INTERESTED', 'QUALIFIED') NOT NULL,
  `duration_seconds` INT NOT NULL DEFAULT 0,
  `remarks` TEXT DEFAULT NULL,
  `next_action` VARCHAR(255) DEFAULT NULL,
  `called_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ca_lead` (`lead_id`),
  KEY `idx_ca_caller` (`telecaller_id`),
  CONSTRAINT `fk_ca_lead` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ca_caller` FOREIGN KEY (`telecaller_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Follow ups table
CREATE TABLE `follow_ups` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `lead_id` INT NOT NULL,
  `telecaller_id` INT NOT NULL,
  `due_date` DATETIME NOT NULL,
  `status` ENUM('PENDING', 'COMPLETED', 'OVERDUE', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `notes` TEXT DEFAULT NULL,
  `completed_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fu_lead` (`lead_id`),
  KEY `idx_fu_caller` (`telecaller_id`),
  KEY `idx_fu_due` (`due_date`, `status`),
  CONSTRAINT `fk_fu_lead` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fu_caller` FOREIGN KEY (`telecaller_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. CONVERSIONS & FINANCIAL TRANSACTIONS MODULE
-- ----------------------------------------------------------------------------

DROP TABLE IF EXISTS `transactions`;
DROP TABLE IF EXISTS `conversions`;

-- Conversions table
CREATE TABLE `conversions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `lead_id` INT NOT NULL UNIQUE,
  `campaign_id` INT DEFAULT NULL,
  `confirmed_by` INT NOT NULL,
  `converted_value` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `notes` TEXT DEFAULT NULL,
  `converted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_conv_campaign` (`campaign_id`),
  CONSTRAINT `fk_conv_lead` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_conv_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_conv_user` FOREIGN KEY (`confirmed_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Transactions table
CREATE TABLE `transactions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `conversion_id` INT NOT NULL,
  `lead_id` INT NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `payment_status` ENUM('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'COMPLETED',
  `payment_method` VARCHAR(50) NOT NULL DEFAULT 'CREDIT_CARD',
  `transaction_ref` VARCHAR(100) NOT NULL UNIQUE,
  `recorded_by` INT NOT NULL,
  `transaction_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tx_conv` (`conversion_id`),
  KEY `idx_tx_lead` (`lead_id`),
  CONSTRAINT `fk_tx_conv` FOREIGN KEY (`conversion_id`) REFERENCES `conversions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tx_lead` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tx_user` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 6. SYSTEM AUDIT, METRICS & PACKAGES MODULE
-- ----------------------------------------------------------------------------

DROP TABLE IF EXISTS `notifications`;
DROP TABLE IF EXISTS `audit_logs`;
DROP TABLE IF EXISTS `daily_performance`;
DROP TABLE IF EXISTS `packages`;

-- User notifications table
CREATE TABLE `notifications` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `title` VARCHAR(150) NOT NULL,
  `message` TEXT NOT NULL,
  `type` ENUM('INFO', 'SUCCESS', 'WARNING', 'ALERT') NOT NULL DEFAULT 'INFO',
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `read_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notif_user` (`user_id`, `is_read`),
  CONSTRAINT `fk_notif_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- System Audit logs table
CREATE TABLE `audit_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `actor_id` INT DEFAULT NULL,
  `action` VARCHAR(100) NOT NULL,
  `entity_type` VARCHAR(100) NOT NULL,
  `entity_id` VARCHAR(100) NOT NULL,
  `previous_state` JSON DEFAULT NULL,
  `new_state` JSON DEFAULT NULL,
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `user_agent` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_actor` (`actor_id`),
  KEY `idx_audit_entity` (`entity_type`, `entity_id`),
  CONSTRAINT `fk_audit_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Aggregated Daily Performance metrics table
CREATE TABLE `daily_performance` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `metric_date` DATE NOT NULL UNIQUE,
  `total_spend` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `total_leads` INT NOT NULL DEFAULT 0,
  `qualified_leads` INT NOT NULL DEFAULT 0,
  `conversions` INT NOT NULL DEFAULT 0,
  `total_revenue` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `avg_cpl` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_dp_date` (`metric_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Product Packages table
CREATE TABLE `packages` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `product_id` VARCHAR(100) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `image_url` LONGTEXT DEFAULT NULL,
  `price` DECIMAL(10,2) DEFAULT NULL,
  `description` TEXT DEFAULT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  `created_by` INT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_packages_product` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `product_hero_banners` (
  `product_id` VARCHAR(100) NOT NULL,
  `image_url` LONGTEXT NOT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- PRODUCTION SEED DATA (ROLES, TEAMS & DEFAULT ADMIN USER)
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Insert System Roles
INSERT INTO `roles` (`id`, `name`, `code`, `description`) VALUES
(1, 'Administrator', 'ADMINISTRATOR', 'Full System Access'),
(2, 'Marketing Manager', 'MARKETING_MANAGER', 'Campaign Operations'),
(3, 'Digital Marketing', 'DIGITAL_MARKETING', 'Ad Operations'),
(4, 'Designer', 'DESIGNER', 'Asset Design'),
(5, 'Telecaller', 'TELECALLER', 'Lead Telecalling'),
(6, 'Business Development Manager', 'BDM', 'Package Task Management & Designer Collaboration')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `description` = VALUES(`description`);

-- 2. Insert Core Team
INSERT INTO `teams` (`id`, `name`, `description`) VALUES
(1, 'System Administration', 'Core administrative operations')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `description` = VALUES(`description`);

-- 3. Insert Ready-to-Use Administrator Account (Password: admin123)
INSERT INTO `users` (`id`, `email`, `password_hash`, `full_name`, `role_id`, `team_id`, `department`, `is_active`) VALUES
(1, 'admin@markops.io', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQOEg6Lruj3BoB6tK3y/G', 'System Administrator', 1, 1, 'Executive Operations', 1)
ON DUPLICATE KEY UPDATE
  `password_hash` = VALUES(`password_hash`),
  `full_name` = VALUES(`full_name`),
  `role_id` = VALUES(`role_id`),
  `department` = VALUES(`department`),
  `is_active` = VALUES(`is_active`);

SET FOREIGN_KEY_CHECKS = 1;