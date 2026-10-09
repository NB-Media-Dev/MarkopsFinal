const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const metaWebhookRoutes = require('../routes/meta-webhook.routes');
const {
  extractLeadEvents,
  isValidMetaSignature,
  parseLeadFields,
} = require('./meta.service');
const { dbPool, dbLeadsStore } = require('../db');
const leadsRoutes = require('../routes/leads.routes');

test('parses common Meta field name variants and full names', () => {
  assert.deepEqual(parseLeadFields([
    { name: 'Full Name', values: ['  Ada Lovelace  '] },
    { name: 'Phone Number', values: ['+1 555 0100'] },
    { name: 'email_address', values: ['ada@example.com'] },
  ]), {
    firstName: 'Ada',
    lastName: 'Lovelace',
    phone: '+1 555 0100',
    email: 'ada@example.com',
  });
});

test('keeps separate first and last name fields', () => {
  assert.deepEqual(parseLeadFields([
    { name: 'first_name', values: ['Ada'] },
    { name: 'last_name', values: ['Lovelace'] },
    { name: 'mobile_phone', values: ['5550100'] },
  ]), {
    firstName: 'Ada',
    lastName: 'Lovelace',
    phone: '5550100',
    email: '',
  });
});

test('extracts leadgen event metadata from Meta page change payloads', () => {
  assert.deepEqual(extractLeadEvents({
    entry: [{
      id: 'page-1',
      changes: [
        { field: 'feed', value: {} },
        { field: 'leadgen', value: { leadgen_id: 'lead-1', form_id: 'form-1', ad_id: 'ad-1', campaign_id: 'campaign-1' } },
      ],
    }],
  }), [{
    leadId: 'lead-1',
    formId: 'form-1',
    pageId: 'page-1',
    adId: 'ad-1',
    campaignId: 'campaign-1',
  }]);
});

test('validates the Meta SHA-256 webhook signature', () => {
  const rawBody = Buffer.from('{"entry":[]}');
  const appSecret = 'test-app-secret';
  const signature = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;

  assert.equal(isValidMetaSignature(rawBody, signature, appSecret), true);
  assert.equal(isValidMetaSignature(rawBody, signature, 'wrong-secret'), false);
  assert.equal(isValidMetaSignature(rawBody, 'sha1=invalid', appSecret), false);
});

test('serves Meta verification and signed webhook responses with expected status codes', async () => {
  const previousVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  const previousAppSecret = process.env.META_APP_SECRET;
  const previousSystemToken = process.env.META_SYSTEM_ACCESS_TOKEN;
  const appSecret = 'route-test-secret';
  process.env.META_WEBHOOK_VERIFY_TOKEN = 'route-verify-token';
  process.env.META_APP_SECRET = appSecret;
  process.env.META_SYSTEM_ACCESS_TOKEN = 'route-test-system-token';

  const app = express();
  app.use(express.json({
    verify: (req, res, buffer) => {
      req.rawBody = Buffer.from(buffer);
    },
  }));
  app.use('/api/v1/meta-webhook', metaWebhookRoutes);
  const server = app.listen(0, '127.0.0.1');

  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const address = server.address();
    const baseUrl = `http:

    const verification = await fetch(`${baseUrl}?${new URLSearchParams({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'route-verify-token',
      'hub.challenge': 'challenge-123',
    })}`);
    assert.equal(verification.status, 200);
    assert.equal(await verification.text(), 'challenge-123');

    const badVerification = await fetch(`${baseUrl}?${new URLSearchParams({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong-token',
      'hub.challenge': 'challenge-123',
    })}`);
    assert.equal(badVerification.status, 403);

    const rawBody = '{"entry":[]}';
    const signature = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
    const webhook = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
      body: rawBody,
    });
    assert.equal(webhook.status, 200);
    assert.deepEqual(await webhook.json(), { received: true });

    const originalQueryStrict = dbPool.queryStrict;
    const originalGetConnection = dbPool.getConnection;
    const queuedLeadIds = [];
    dbPool.queryStrict = async (query, params) => {
      assert.match(query, /INSERT INTO meta_webhook_events/);
      queuedLeadIds.push(params[0]);
      return [{ affectedRows: 1 }, []];
    };
    dbPool.getConnection = async () => ({
      beginTransaction: async () => {},
      query: async (query) => query.includes('SELECT meta_lead_id, form_id')
        ? [[], []]
        : [{ affectedRows: 1 }, []],
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
    });
    try {
      const queuedBody = JSON.stringify({
        entry: [{
          id: 'page-1',
          changes: [{
            field: 'leadgen',
            value: { leadgen_id: 'queued-lead-1', form_id: 'form-1', page_id: 'page-1', ad_id: 'ad-1' },
          }],
        }],
      });
      const queuedSignature = `sha256=${crypto.createHmac('sha256', appSecret).update(queuedBody).digest('hex')}`;
      const queuedWebhook = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': queuedSignature },
        body: queuedBody,
      });
      assert.equal(queuedWebhook.status, 200);
      assert.deepEqual(await queuedWebhook.json(), { received: true });
      assert.deepEqual(queuedLeadIds, ['queued-lead-1']);
      await new Promise((resolve) => setTimeout(resolve, 10));
    } finally {
      dbPool.queryStrict = originalQueryStrict;
      dbPool.getConnection = originalGetConnection;
    }
  } finally {
    if (previousVerifyToken === undefined) delete process.env.META_WEBHOOK_VERIFY_TOKEN;
    else process.env.META_WEBHOOK_VERIFY_TOKEN = previousVerifyToken;
    if (previousAppSecret === undefined) delete process.env.META_APP_SECRET;
    else process.env.META_APP_SECRET = previousAppSecret;
    if (previousSystemToken === undefined) delete process.env.META_SYSTEM_ACCESS_TOKEN;
    else process.env.META_SYSTEM_ACCESS_TOKEN = previousSystemToken;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('reuses round-robin lead assignment and acknowledges duplicate Meta lead IDs', async () => {
  const originalQueryStrict = dbPool.queryStrict;
  const originalLeads = [...dbLeadsStore];
  let insertCount = 0;
  let telecallerQueryCount = 0;
  dbPool.queryStrict = async (query) => {
    if (query.includes('COUNT(l.id)')) {
      telecallerQueryCount++;
      const users = telecallerQueryCount === 1
        ? [
          { id: 42, fullName: 'First Telecaller', email: 'first@example.com', assignedCount: 0 },
          { id: 43, fullName: 'Second Telecaller', email: 'second@example.com', assignedCount: 0 },
        ]
        : [
          { id: 43, fullName: 'Second Telecaller', email: 'second@example.com', assignedCount: 0 },
          { id: 42, fullName: 'First Telecaller', email: 'first@example.com', assignedCount: 1 },
        ];
      return [users, []];
    }
    if (query.includes('INSERT INTO leads')) {
      insertCount++;
      if (insertCount === 2) {
        const duplicateError = new Error('Duplicate entry');
        duplicateError.code = 'ER_DUP_ENTRY';
        duplicateError.errno = 1062;
        throw duplicateError;
      }
      return [{ affectedRows: 1 }, []];
    }
    throw new Error(`Unexpected strict database query: ${query}`);
  };

  async function importTestLead() {
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
    await leadsRoutes.handleBatchImport({
      body: {
        leads: [{
          firstName: 'Meta',
          lastName: 'Lead',
          email: 'meta@example.com',
          phone: '+1 555 0101',
          metaLeadId: 'meta-lead-unique-1',
        }],
        source: 'META_ADS',
        uploaderId: '1',
        uploaderEmail: 'meta-webhook@markops.io',
        uploaderRole: 'ADMINISTRATOR',
      },
      headers: {},
      ip: 'meta-test',
      socket: { remoteAddress: 'meta-test' },
    }, response, { metaWebhook: true });
    return response;
  }

  try {
    const first = await importTestLead();
    assert.equal(first.statusCode, 201);
    assert.equal(first.body.leads[0].assignedTo, '42');
    assert.equal(first.body.leads[0].assignmentStatus, 'ASSIGNED');
    assert.equal(first.body.leads[0].metaLeadId, 'meta-lead-unique-1');

    const duplicate = await importTestLead();
    assert.equal(duplicate.statusCode, 200);
    assert.equal(duplicate.body.duplicate, true);
    assert.equal(telecallerQueryCount, 2);
    assert.equal(dbLeadsStore.filter((lead) => lead.metaLeadId === 'meta-lead-unique-1').length, 1);
  } finally {
    dbPool.queryStrict = originalQueryStrict;
    dbLeadsStore.length = 0;
    dbLeadsStore.push(...originalLeads);
  }
});
