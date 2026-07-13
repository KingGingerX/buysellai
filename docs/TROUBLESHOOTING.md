# BuySellAI.store Troubleshooting

## Service Fails Health Check

Verify:

```bash
npm run start
curl http://127.0.0.1:4173/healthz
```

On Render, confirm `HOST=0.0.0.0` and that the service health check path is `/healthz`.

## Checkout Returns Configuration Error

Confirm the production host has:

```text
STRIPE_SECRET_KEY
STRIPE_CHECKOUT_SUCCESS_URL
STRIPE_CHECKOUT_CANCEL_URL
```

Use live Stripe keys only for production.

## Seller Onboarding Returns Configuration Error

Confirm the production host has:

```text
STRIPE_SECRET_KEY
STRIPE_CONNECT_REFRESH_URL
STRIPE_CONNECT_RETURN_URL
```

## Webhook Returns Configuration Error

Confirm the production host has:

```text
STRIPE_WEBHOOK_SECRET
```

Also confirm the Stripe webhook endpoint is:

```text
https://buysellai.store/api/stripe/webhook
```

## DNS Still Shows Namecheap Parking

Remove these parking records after Render supplies replacement records:

```text
A @ 192.64.119.223
CNAME www parkingpage.namecheap.com
```

Then add the apex and `www` records supplied by Render for `buysellai.store`.

## Data Missing After Deploy

Confirm `/app/data` is mounted to a persistent disk. If the persistent disk was not attached before launch, restore `data/store.json` from backup.
