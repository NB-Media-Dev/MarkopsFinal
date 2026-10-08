ALTER TABLE campaigns
  ADD COLUMN meta_campaign_id VARCHAR(100) NULL,
  ADD COLUMN clicks INT NOT NULL DEFAULT 0,
  ADD COLUMN impressions INT NOT NULL DEFAULT 0,
  ADD UNIQUE INDEX uq_campaigns_meta_campaign_id (meta_campaign_id);

ALTER TABLE ads
  ADD UNIQUE INDEX uq_ads_platform_ad_id (platform_ad_id),
  ADD INDEX idx_ads_platform_campaign_id (platform_campaign_id);

ALTER TABLE leads
  ADD COLUMN meta_lead_id VARCHAR(100) NULL,
  ADD COLUMN meta_campaign_id VARCHAR(100) NULL,
  ADD COLUMN meta_ad_id VARCHAR(100) NULL,
  ADD COLUMN assigned_telecaller_id INT NULL,
  ADD COLUMN assignment_status VARCHAR(30) NOT NULL DEFAULT 'UNASSIGNED',
  ADD COLUMN call_disposition VARCHAR(100) NULL,
  ADD UNIQUE INDEX uq_leads_meta_lead_id (meta_lead_id),
  ADD INDEX idx_leads_meta_campaign_id (meta_campaign_id),
  ADD INDEX idx_leads_meta_ad_id (meta_ad_id),
  ADD INDEX idx_leads_assigned_telecaller_id (assigned_telecaller_id),
  ADD CONSTRAINT fk_leads_meta_campaign
    FOREIGN KEY (meta_campaign_id) REFERENCES campaigns (meta_campaign_id)
    ON DELETE SET NULL,
  ADD CONSTRAINT fk_leads_meta_ad
    FOREIGN KEY (meta_ad_id) REFERENCES ads (platform_ad_id)
    ON DELETE SET NULL,
  ADD CONSTRAINT fk_leads_assigned_telecaller
    FOREIGN KEY (assigned_telecaller_id) REFERENCES users (id)
    ON DELETE SET NULL;

UPDATE leads
SET assigned_telecaller_id = assigned_to,
    assignment_status = IF(assigned_to IS NULL, 'UNASSIGNED', 'ASSIGNED');

CREATE TABLE meta_webhook_events (
  meta_lead_id VARCHAR(100) NOT NULL,
  form_id VARCHAR(100) DEFAULT NULL,
  page_id VARCHAR(100) DEFAULT NULL,
  ad_id VARCHAR(100) DEFAULT NULL,
  campaign_id VARCHAR(100) DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT DEFAULT NULL,
  next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (meta_lead_id),
  KEY idx_meta_webhook_status_next_attempt (status, next_attempt_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
