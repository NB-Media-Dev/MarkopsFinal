const express = require('express');
const { dbPool } = require('../db');
const leadsRoutes = require('./leads.routes');
const {
  extractLeadEvents,
  fetchGraphAd,
  fetchGraphLead,
  isValidMetaSignature,
  parseLeadFields,
} = require('../services/meta.service');

const router = express.Router();
let queueWorkerRunning = false;
let queueWorkerTimer = null;

router.get('/', (req, res) => {
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (!verifyToken) {
    return res.status(503).send('Webhook verification is not configured.');
  }
  if (mode === 'subscribe' && token === verifyToken && typeof challenge === 'string') {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

async function ensureMetaReferences(campaignId, adId, campaignName, adName) {
  if (!dbPool) throw new Error('Database is required to ingest Meta leads');
  let mysqlCampaignId = null;

  if (campaignId) {
    await dbPool.queryStrict(
      `INSERT INTO campaigns
       (name, objective, status, start_date, budget, spend, leads_count, target_cpl, target_qualified_pct,
        target_conversion_pct, owner_id, meta_campaign_id, clicks, impressions)
       VALUES (?, 'LEAD_GENERATION', 'ACTIVE', CURDATE(), 0, 0, 0, 0, 0, 0, 1, ?, 0, 0)
       ON DUPLICATE KEY UPDATE meta_campaign_id = VALUES(meta_campaign_id)`,
      [campaignName || `Meta Campaign ${campaignId}`, campaignId]
    );
    const [campaignRows] = await dbPool.queryStrict(
      'SELECT id FROM campaigns WHERE meta_campaign_id = ? LIMIT 1',
      [campaignId]
    );
    mysqlCampaignId = campaignRows[0]?.id || null;
  }

  if (adId) {
    await dbPool.queryStrict(
      `INSERT INTO ads
       (campaign_id, platform, platform_ad_id, platform_campaign_id, name, status, spend, impressions, clicks, leads_count)
       VALUES (?, 'Meta', ?, ?, ?, 'ACTIVE', 0, 0, 0, 0)
       ON DUPLICATE KEY UPDATE platform_ad_id = VALUES(platform_ad_id)`,
      [mysqlCampaignId, adId, campaignId, adName || `Meta Ad ${adId}`]
    );
  }
}

async function enqueueLeadEvents(events) {
  if (!dbPool) throw new Error('Database is required to queue Meta webhook events');
  for (const event of events) {
    await dbPool.queryStrict(
      `INSERT INTO meta_webhook_events
       (meta_lead_id, form_id, page_id, ad_id, campaign_id, status, attempts, next_attempt_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'PENDING', 0, NOW(), NOW(), NOW())
       ON DUPLICATE KEY UPDATE
       form_id = COALESCE(VALUES(form_id), form_id), page_id = COALESCE(VALUES(page_id), page_id),
       ad_id = COALESCE(VALUES(ad_id), ad_id), campaign_id = COALESCE(VALUES(campaign_id), campaign_id),
       attempts = IF(status = 'FAILED', 0, attempts),
       last_error = IF(status = 'FAILED', NULL, last_error),
       next_attempt_at = IF(status = 'FAILED', NOW(), next_attempt_at),
       status = IF(status = 'FAILED', 'PENDING', status), updated_at = NOW()`,
      [event.leadId, event.formId, event.pageId, event.adId, event.campaignId]
    );
  }
}

async function processMetaLead(event) {
  const lead = await fetchGraphLead(event.meta_lead_id);
  const fields = parseLeadFields(lead.field_data);
  if (!fields.firstName || !fields.phone) {
    throw new Error(`Meta lead ${event.meta_lead_id} is missing a name or phone number`);
  }

  const adId = String(lead.ad_id || event.ad_id || '');
  const adDetails = adId && !event.campaign_id ? await fetchGraphAd(adId) : null;
  const campaignId = String(lead.campaign_id || event.campaign_id || adDetails?.campaign_id || '');
  if (adId && !campaignId) throw new Error(`Meta ad ${adId} has no campaign identifier`);
  await ensureMetaReferences(campaignId, adId, adDetails?.campaign_name, adDetails?.name);

  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  await leadsRoutes.handleBatchImport(
    {
      body: {
        leads: [{
          ...fields,
          metaLeadId: event.meta_lead_id,
          metaCampaignId: campaignId || null,
          metaAdId: adId || null,
        }],
        campaignName: campaignId ? `Meta Campaign ${campaignId}` : 'Meta Lead Ads',
        source: 'META_ADS',
        uploaderId: '1',
        uploaderEmail: 'meta-webhook@markops.io',
        uploaderRole: 'ADMINISTRATOR',
      },
      ip: 'meta-webhook',
      socket: { remoteAddress: 'meta-webhook' },
      headers: {},
    },
    response,
    { metaWebhook: true }
  );

  if (response.statusCode >= 400) {
    throw new Error(response.body?.error || `Lead import failed with status ${response.statusCode}`);
  }
}

async function processPendingMetaLeads() {
  if (queueWorkerRunning) return;
  queueWorkerRunning = true;
  let connection;
  try {
    connection = await dbPool.getConnection();
    await connection.beginTransaction();
    await connection.query(
      `UPDATE meta_webhook_events SET status = 'PENDING', updated_at = NOW()
       WHERE status = 'PROCESSING' AND updated_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)`
    );
    const [events] = await connection.query(
      `SELECT meta_lead_id, form_id, page_id, ad_id, campaign_id
       FROM meta_webhook_events
       WHERE status = 'PENDING' AND next_attempt_at <= NOW()
       ORDER BY created_at ASC
       LIMIT 20
       FOR UPDATE SKIP LOCKED`
    );
    for (const event of events) {
      await connection.query(
        `UPDATE meta_webhook_events SET status = 'PROCESSING', updated_at = NOW()
         WHERE meta_lead_id = ?`,
        [event.meta_lead_id]
      );
    }
    await connection.commit();

    for (const event of events) {
      try {
        await processMetaLead(event);
        await dbPool.queryStrict(
          `UPDATE meta_webhook_events
           SET status = 'PROCESSED', last_error = NULL, updated_at = NOW()
           WHERE meta_lead_id = ?`,
          [event.meta_lead_id]
        );
      } catch (error) {
        console.error(`[Meta Webhook Error] Lead ${event.meta_lead_id} ingestion failed:`, error.message);
        await dbPool.queryStrict(
          `UPDATE meta_webhook_events
           SET attempts = attempts + 1,
               status = IF(attempts + 1 >= 10, 'FAILED', 'PENDING'),
               last_error = LEFT(?, 2000),
               next_attempt_at = DATE_ADD(NOW(), INTERVAL 5 MINUTE),
               updated_at = NOW()
           WHERE meta_lead_id = ?`,
          [error.message, event.meta_lead_id]
        );
      }
    }
  } catch (error) {
    if (connection) {
      await connection.rollback().catch((rollbackError) => {
        console.error('[Meta Webhook Queue Error] Queue transaction rollback failed:', rollbackError.message);
      });
    }
    throw error;
  } finally {
    if (connection) connection.release();
    queueWorkerRunning = false;
  }
}

router.post('/', (req, res) => {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret || !process.env.META_SYSTEM_ACCESS_TOKEN) {
    return res.status(503).json({ error: 'Meta webhook processing is not configured.' });
  }
  if (!isValidMetaSignature(req.rawBody, req.get('x-hub-signature-256'), appSecret)) {
    return res.sendStatus(403);
  }

  const events = extractLeadEvents(req.body);
  if (events.length === 0) return res.status(200).json({ received: true });

  void enqueueLeadEvents(events).then(() => {
    res.status(200).json({ received: true });
    return processPendingMetaLeads();
  }).catch((error) => {
    console.error('[Meta Webhook Queue Error] Failed to persist or process lead event:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Meta lead event could not be queued; Meta may retry this event.' });
    }
  });
});

function startMetaWebhookQueueWorker() {
  if (!process.env.META_SYSTEM_ACCESS_TOKEN || !dbPool.isConnected()) {
    console.warn('[Meta Webhook] Queue worker disabled; configure the Meta token and database connection.');
    return null;
  }
  if (queueWorkerTimer) return queueWorkerTimer;
  void processPendingMetaLeads().catch((error) => {
    console.error('[Meta Webhook Queue Error] Queue processing failed:', error.message);
  });
  queueWorkerTimer = setInterval(() => {
    void processPendingMetaLeads().catch((error) => {
      console.error('[Meta Webhook Queue Error] Queue processing failed:', error.message);
    });
  }, 30000);
  queueWorkerTimer.unref();
  return queueWorkerTimer;
}

module.exports = router;
module.exports.startMetaWebhookQueueWorker = startMetaWebhookQueueWorker;
