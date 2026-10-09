SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE `transactions`;
TRUNCATE TABLE `conversions`;
TRUNCATE TABLE `follow_ups`;
TRUNCATE TABLE `call_activities`;
TRUNCATE TABLE `lead_status_history`;
TRUNCATE TABLE `lead_assignments`;
TRUNCATE TABLE `leads`;
TRUNCATE TABLE `task_attachments`;
TRUNCATE TABLE `task_comments`;
TRUNCATE TABLE `task_versions`;
TRUNCATE TABLE `task_progress_history`;
TRUNCATE TABLE `task_status_history`;
TRUNCATE TABLE `task_assignments`;
TRUNCATE TABLE `tasks`;
TRUNCATE TABLE `ad_metrics`;
TRUNCATE TABLE `ads`;
TRUNCATE TABLE `meta_sync_logs`;
TRUNCATE TABLE `meta_connections`;
TRUNCATE TABLE `campaigns`;
TRUNCATE TABLE `users`;
TRUNCATE TABLE `teams`;
TRUNCATE TABLE `role_permissions`;
TRUNCATE TABLE `permissions`;
TRUNCATE TABLE `roles`;

INSERT INTO `roles` (`id`, `name`, `code`, `description`) VALUES
(1, 'Administrator', 'ADMINISTRATOR', 'Full System Access'),
(2, 'Marketing Manager', 'MARKETING_MANAGER', 'Campaign Operations'),
(3, 'Digital Marketing', 'DIGITAL_MARKETING', 'Ad Operations'),
(4, 'Designer', 'DESIGNER', 'Asset Design'),
(5, 'Telecaller', 'TELECALLER', 'Lead Telecalling'),
(6, 'Business Development Manager', 'BDM', 'Package Task Management & Designer Collaboration');

INSERT INTO `teams` (`id`, `name`, `description`) VALUES
(1, 'System Administration', 'Core administrative operations');

INSERT INTO `users` (`id`, `email`, `password_hash`, `full_name`, `role_id`, `team_id`, `department`, `is_active`) VALUES
(1, 'admin@markops.io', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQOEg6Lruj3BoB6tK3y/G', 'System Administrator', 1, 1, 'Executive Operations', 1),
(2, 'bdm@markops.io', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQOEg6Lruj3BoB6tK3y/G', 'Business Development Manager', 6, 1, 'Business Development', 1);

SET FOREIGN_KEY_CHECKS = 1;
