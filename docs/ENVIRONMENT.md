# BuySellAI.store Environment

## Production Variables

Set these values in the production host. Do not commit real secrets.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | Yes | Set to `production` so cookies are marked `Secure`. |
| `HOST` | Yes | Set to `0.0.0.0` on hosted services. |
| `PORT` | Host supplied | The HTTP port. Render injects this automatically. |
| `STRIPE_SECRET_KEY` | Yes for payments | Live Stripe secret key used only by the server. |
| `STRIPE_CONNECT_REFRESH_URL` | Yes for seller onboarding | Seller onboarding retry URL. |
| `STRIPE_CONNECT_RETURN_URL` | Yes for seller onboarding | Seller onboarding return URL. |
| `STRIPE_CHECKOUT_SUCCESS_URL` | Yes for checkout | Buyer return URL after payment. |
| `STRIPE_CHECKOUT_CANCEL_URL` | Yes for checkout | Buyer return URL after canceling checkout. |
| `STRIPE_WEBHOOK_SECRET` | Yes for fulfillment | Stripe webhook signing secret. |
| `STRIPE_TIMEOUT_MS` | Recommended | Stripe API timeout in milliseconds. Defaults to `10000`. |

## Render Values

The included `render.yaml` sets non-secret values and declares secret values with `sync: false`.
After creating the Render service, enter real values for:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

Keep `NODE_ENV=production` and `HOST=0.0.0.0`.

## Persistence

Marketplace records are stored in `data/store.json`. On Render, `/app/data` must be backed by the persistent disk declared in `render.yaml`.

Before replacing the service or changing disk settings, export a backup of `data/store.json`.
