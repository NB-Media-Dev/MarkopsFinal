ALTER TABLE `ads`
  ADD COLUMN `created_by` INT DEFAULT NULL,
  ADD KEY `idx_ads_created_by` (`created_by`),
  ADD CONSTRAINT `fk_ads_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);

UPDATE `ads` a
JOIN `campaigns` c ON c.`id` = a.`campaign_id`
SET a.`created_by` = c.`owner_id`;