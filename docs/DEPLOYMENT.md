# BuySellAI.store Deployment

## Build

Run the full validation gate before release:

```bash
npm run validate
```

The production artifact is generated in `dist` by:

```bash
npm run build
```

Deploy the repository to a Node host and run:

```bash
npm run start
```

The server listens on `PORT` when provided and stores marketplace records in `data/store.json`.
Set `HOST=0.0.0.0` on production hosts so the service accepts external traffic.

## Runtime Notes

Listings, users, carts, sessions, orders, payout onboarding state, and complaint records are persisted server-side. Configure these environment variables before enabling seller payouts:

```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_CONNECT_REFRESH_URL=https://buysellai.store/#seller-dashboard
STRIPE_CONNECT_RETURN_URL=https://buysellai.store/#seller-dashboard
STRIPE_CHECKOUT_SUCCESS_URL=https://buysellai.store/#buyer-dashboard
STRIPE_CHECKOUT_CANCEL_URL=https://buysellai.store/#buyer-dashboard
STRIPE_WEBHOOK_SECRET=whsec_...
```

Checkout uses Stripe destination charges and refuses mixed-seller carts. The connected seller account receives the destination transfer according to Stripe settlement rules, while the platform records a payout ledger entry after the signed checkout completion webhook.

## Rollback

Keep the previous release artifact and a backup of `data/store.json`. Rollback requires restoring both application files and the matching data snapshot.
