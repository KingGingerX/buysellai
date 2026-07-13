# BuySellAI.store

BuySellAI.store is a marketplace foundation for AI assets, automations, prompt systems, datasets, and implementation services.

The app is intentionally dependency-light. It runs as a Node-backed marketplace with account authentication, server-owned listings, locked prices, seller identity controls, buyer carts, seller and admin dashboards, legal pages, DMCA notices, copyright complaints, Stripe Connect onboarding, Stripe Checkout, signed payment webhooks, seller-owned refund requests, tests, and release checks.

## Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
npm run validate
npm run watchdog
```

## Domain

`buysellai.store` is configured as the production domain target in `.env.example`, `render.yaml`, and `docs/DOMAIN.md`. DNS still must be changed at the registrar from Namecheap parking to the records supplied by the production Node host.

## Production Path

Before live launch, add admin resolution actions for complaints, support tooling, immutable listing revisions, rate limits, and audit export. Payment checkout, fulfillment release, seller refund decisions, and payout ledger recording are implemented behind real Stripe configuration.
