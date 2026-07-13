# BuySellAI.store Operations

## Health Checks

Use:

```bash
curl https://buysellai.store/healthz
```

Expected response:

```json
{"service":"buysellai.store","status":"ok","time":"..."}
```

## Release Verification

Run before every deploy:

```bash
npm run validate
```

This runs lint, typecheck, tests, build, and ProjectWatchdog.

## Data Backup

Back up `data/store.json` before deploys that change persistence, marketplace data handling, checkout, refunds, or auth.

For Render, use the persistent disk shell or service backup process to copy `/app/data/store.json` to a secure backup location.

## Rollback

Rollback requires both:

1. The prior application release.
2. The matching `data/store.json` snapshot.

Do not roll back application code alone after payment, fulfillment, refund, or seller onboarding schema changes.

## Stripe Webhooks

Configure Stripe to send checkout events to:

```text
https://buysellai.store/api/stripe/webhook
```

The server verifies the `Stripe-Signature` header before releasing fulfillment or recording payout ledger entries.

## Shutdown Behavior

The server handles `SIGTERM` and `SIGINT` by closing the HTTP listener and waiting for pending store writes before exiting.
