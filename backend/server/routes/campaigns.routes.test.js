const assert = require('node:assert/strict');
const { after, before, beforeEach, test } = require('node:test');
const express = require('express');
const { authenticateJwt } = require('../middleware/auth.middleware');
const { dbPool, dbCampaignsStore, dbAdsStore } = require('../db');
const campaignRoutes = require('./campaigns.routes');

let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(authenticateJwt(dbPool));
  app.use('/api', campaignRoutes);
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

beforeEach(() => {
  dbCampaignsStore.length = 0;
  dbAdsStore.length = 0;
  dbCampaignsStore.push({
    id: 'campaign-1',
    name: 'Owned campaign',
    ownerId: '2',
    objective: 'LEAD_GENERATION',
    status: 'ACTIVE',
    budget: 100,
    spend: 0,
    leadsCount: 0,
    cpl: 0,
    conversions: 0,
    convRate: 0,
    qualifiedLeads: 0,
    targetLeads: 0,
    targetCpl: 0,
    targetQualifiedPct: 0,
    targetConversionPct: 0,
    revenue: 0,
  });
  dbAdsStore.push({
    id: 'ad-1',
    name: 'Owned ad',
    createdBy: '2',
    campaignId: 'campaign-1',
    campaignName: 'Owned campaign',
    platform: 'Meta',
    status: 'ACTIVE',
    spend: 0,
    impressions: 0,
    clicks: 0,
    leadsCount: 0,
    ctr: 0,
    cpc: 0,
    cpl: 0,
  });
});

async function callAs(userId, role, method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: 'Bearer mo_jwt_default',
      'X-User-Id': String(userId),
      'X-User-Role': role,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return response;
}

test('campaign updates and deletes are limited to the creator, including for administrators', async () => {
  const deniedUpdate = await callAs(3, 'ADMINISTRATOR', 'PUT', '/api/campaigns/campaign-1', { name: 'Changed' });
  assert.equal(deniedUpdate.status, 403);

  const allowedUpdate = await callAs(2, 'DIGITAL_MARKETING', 'PUT', '/api/campaigns/campaign-1', { name: 'Changed' });
  assert.equal(allowedUpdate.status, 200);
  assert.equal(dbCampaignsStore[0].name, 'Changed');

  const deniedDelete = await callAs(3, 'ADMINISTRATOR', 'DELETE', '/api/campaigns/campaign-1');
  assert.equal(deniedDelete.status, 403);
  assert.equal(dbCampaignsStore.length, 1);

  const allowedDelete = await callAs(2, 'DIGITAL_MARKETING', 'DELETE', '/api/campaigns/campaign-1');
  assert.equal(allowedDelete.status, 200);
  assert.equal(dbCampaignsStore.length, 0);
});

test('ad metric updates and deletes are limited to the creator, including for administrators', async () => {
  const deniedUpdate = await callAs(3, 'ADMINISTRATOR', 'PUT', '/api/ads/ad-1', { name: 'Changed' });
  assert.equal(deniedUpdate.status, 403);

  const allowedUpdate = await callAs(2, 'DIGITAL_MARKETING', 'PUT', '/api/ads/ad-1', { name: 'Changed' });
  assert.equal(allowedUpdate.status, 200);
  assert.equal(dbAdsStore[0].name, 'Changed');

  const deniedDelete = await callAs(3, 'ADMINISTRATOR', 'DELETE', '/api/ads/ad-1');
  assert.equal(deniedDelete.status, 403);
  assert.equal(dbAdsStore.length, 1);

  const allowedDelete = await callAs(2, 'DIGITAL_MARKETING', 'DELETE', '/api/ads/ad-1');
  assert.equal(allowedDelete.status, 200);
  assert.equal(dbAdsStore.length, 0);
});

test('campaign and ad creators are assigned from the authenticated user, not the request body', async () => {
  const campaignResponse = await callAs(2, 'DIGITAL_MARKETING', 'POST', '/api/campaigns', {
    name: 'Created campaign',
    ownerId: '3',
    ownerName: 'Forged owner',
  });
  assert.equal(campaignResponse.status, 201);
  const campaign = await campaignResponse.json();
  assert.equal(campaign.ownerId, '2');

  const adResponse = await callAs(2, 'DIGITAL_MARKETING', 'POST', '/api/ads', {
    name: 'Created ad',
    campaignId: campaign.id,
    createdBy: '3',
  });
  assert.equal(adResponse.status, 201);
  const ad = await adResponse.json();
  assert.equal(ad.createdBy, '2');
});

test('campaign deletion does not cascade-delete ads created by other users', async () => {
  dbAdsStore[0].createdBy = '3';
  const response = await callAs(2, 'DIGITAL_MARKETING', 'DELETE', '/api/campaigns/campaign-1');
  assert.equal(response.status, 409);
  assert.equal(dbCampaignsStore.length, 1);
  assert.equal(dbAdsStore.length, 1);
});