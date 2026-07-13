# BuySellAI.store Domain Connection

## Current DNS Status

`buysellai.store` currently resolves to Namecheap parking:

```text
buysellai.store A 192.64.119.223
www.buysellai.store CNAME parkingpage.namecheap.com
```

That means the domain is owned but not connected to this marketplace application yet.

## Required Hosting Shape

This application is a Node server. It needs a host that supports long-running Node/Docker services because authentication, Stripe webhooks, server-side carts, orders, and file-backed records are handled by `scripts/serve.mjs`.

Use the included `Dockerfile` or `render.yaml` to deploy the app.

## DNS Records To Replace Parking

After Render creates the production service and custom domain, replace Namecheap parking records with the records from Render.

Typical setup:

```text
Type  Host  Value supplied by host
A     @     host apex IP address
CNAME www   host CNAME target
```

Do not keep the current `192.64.119.223` parking A record or the `parkingpage.namecheap.com` CNAME after the real host provides its records.

## Production Environment

Set these variables on the host:

```bash
HOST=0.0.0.0
STRIPE_SECRET_KEY=sk_live_...
STRIPE_CONNECT_REFRESH_URL=https://buysellai.store/#seller-dashboard
STRIPE_CONNECT_RETURN_URL=https://buysellai.store/#seller-dashboard
STRIPE_CHECKOUT_SUCCESS_URL=https://buysellai.store/#buyer-dashboard
STRIPE_CHECKOUT_CANCEL_URL=https://buysellai.store/#buyer-dashboard
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Verification

After DNS propagation:

```bash
Resolve-DnsName buysellai.store
Resolve-DnsName www.buysellai.store
Invoke-WebRequest https://buysellai.store/healthz
```

The health endpoint should return `status: ok`.
