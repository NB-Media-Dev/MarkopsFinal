# Meta Lead Ads integration

## Configuration

Set these variables only in the backend environment (never in Angular or another client):

```env
META_SYSTEM_ACCESS_TOKEN=<long-lived system-user access token>
META_AD_ACCOUNT_ID=act_<ad-account-id>
META_WEBHOOK_VERIFY_TOKEN=<random webhook verification string>
META_APP_SECRET=<Meta app secret>
META_API_VERSION=v26.0
```

The system user needs access to the ad account and the permissions required to read
ad insights and retrieve leads (typically `ads_read`, `leads_retrieval`, and
`pages_manage_metadata`). The Meta app must be subscribed to the Page `leadgen`
webhook field. Configure Meta's
callback URL as `https://<backend-host>/api/v1/meta-webhook` and use the same
`META_WEBHOOK_VERIFY_TOKEN` in the Meta app webhook setup. The `META_APP_SECRET`
is used to validate `X-Hub-Signature-256` on every POST. Do not expose any of
these values in frontend environment variables.

## Database migration

Back up the database, then apply
`prisma/migrations/20261008000000_meta_lead_ads/migration.sql` to the existing
MySQL database before deploying the updated server. Alternatively, use the
repository's Prisma schema workflow after reviewing the generated SQL for your
environment:

```sh
cd backend
npm run db:generate
npm run db:push
```

MarkOps already uses integer primary keys for `campaigns.id`, `ads.id`,
`leads.campaign_id`, and `leads.ad_id`. The migration retains those keys and adds
unique/indexed Meta IDs to the existing campaign/ad tables; lead Meta IDs link
to those Meta IDs using separate columns. Existing `assigned_to` remains intact;
`assigned_telecaller_id` is kept synchronized with it and both reference the
telecaller user. `assignment_status` / `call_disposition` remain separate lead
workflow fields.

The Leads UI no longer offers spreadsheet upload, and the public
`POST /api/leads/batch-import` endpoint has been removed. The shared batch
importer is retained as an internal function for Meta ingestion and keeps the
existing assignment behavior.

## Behavior and validation

- Meta validates the public callback with `GET
  /api/v1/meta-webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`.
  A matching verification token returns the challenge verbatim; a mismatch
  returns `403`.
- Signed lead-generation POSTs are first persisted to the `meta_webhook_events`
  inbox, then acknowledged with `200`; Graph API retrieval and lead distribution
  run asynchronously. This makes the immediate Meta acknowledgement durable.
  The queue worker drains pending events on startup and checks for more every
  30 seconds.
  Lead fields are normalized and passed to MarkOps' existing batch importer.
  For one-at-a-time events, it chooses the active telecaller with the fewest
  assignments; batches retain the existing round-robin allocation.
- `meta_lead_id` is unique. Repeated webhook deliveries return `200` without
  creating another lead. Failed inbox processing retries every five minutes up
  to ten attempts; after that the event is marked `FAILED`. Redelivering that
  event from Meta requeues it. Failure to persist the inbox returns `500`, so
  Meta can retry the delivery.
- The backend runs an insights sync at startup and every three hours. It requests
  ad-level insights for `this_month`, handles Graph API pagination, upserts
  campaign spend/clicks/impressions and ad metrics, and serves them through
  the existing campaign and ad APIs.
- The sync scheduler is disabled until both access-token and ad-account
  environment variables are configured.

## Test with Meta's Lead Ads Testing Tool

1. Deploy the backend with a public HTTPS URL, apply the database migration, and
   configure the environment variables above.
2. In Meta for Developers, open the app's **Webhooks** settings, add the **Page**
   object, set the callback URL to
   `https://<backend-host>/api/v1/meta-webhook`, enter the configured verify
   token, and subscribe to `leadgen`. Complete the callback verification.
3. Grant the app access to the Facebook Page and ad account that own the test
   lead form. Confirm at least one active telecaller exists in MarkOps.
4. Open Meta's **Lead Ads Testing Tool**, choose the Page and lead form, and use
   **Create Lead** (or the tool's equivalent test-lead action) to generate a
   sample submission.
5. Check backend logs for `[Meta Webhook]` ingestion errors and inspect the
   MarkOps Leads page. The lead should appear with source `META_ADS`, its Meta
   campaign/ad identifiers, and the same fair telecaller assignment as other
   imported leads. Confirm `assignment_status` is `ASSIGNED` when a telecaller
   was available, otherwise `UNASSIGNED`.
6. Create the same test event again if the tool allows it, or redeliver the
   webhook event. The endpoint should return `200` and only one row should exist
   for that `meta_lead_id`.
7. To test analytics, wait for the startup sync or the next three-hour run,
   then check the existing campaign and ad endpoints (`GET /api/campaigns` and
   `GET /api/ads`) for the synced spend, clicks, and impressions.

Run the focused parser/signature tests from `backend` with:

```sh
npm run test:meta
```
