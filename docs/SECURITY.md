# BuySellAI.store Security

## Current Controls

Seller input is required, length-limited, normalized, and validated on the server. Cart operations only accept listing identifiers that exist in active marketplace state.

Stripe Connect onboarding, Checkout, signed webhooks, and processor refunds use real Stripe API calls when the required environment variables are configured. Missing configuration returns an operational error instead of recording payout or refund completion.

Refund responsibility belongs to the seller of record. Buyers can request refunds after payment, sellers approve or reject them, and processor refund execution only runs after seller approval. BuySellAI.store records the audit trail without assuming seller liability.

## Production Backend Requirements

Store listing revisions immutably before high-volume launch, rotate session tokens on privilege changes, add rate limits at the edge, and keep payment secrets outside the browser. Do not trust browser state for pricing, license grants, or fulfillment rights.

## Sensitive Data

Do not store secrets, payment tokens, customer private data, or seller tax records in browser storage. Use a managed payment provider and a server-side order ledger for those records.
