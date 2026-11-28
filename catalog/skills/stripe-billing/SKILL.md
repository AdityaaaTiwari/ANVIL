---
description: Implement Stripe Checkout, Subscriptions, and Customer Portal reliably: signed webhooks, entitlements and idempotency
profile: standard
tags: stripe, billing, payments, webhooks
---

# Stripe billing

Use when adding or updating Stripe Checkout Sessions, Subscriptions, Customer Portal, or billing webhooks.

## Checkout and portal flow
- Create Checkout Sessions and Billing Portal Sessions exclusively on the server using fixed server-side `price_...` IDs (never accept prices or trial days from client request bodies).
- Store `stripeCustomerId` mapped 1:1 to your internal tenant/user record before spawning multiple checkouts so a user does not accumulate orphan Stripe Customers.
- Configure explicit `allow_promotion_codes`, `client_reference_id`, and `metadata` tying Stripe objects cleanly back to your internal account IDs.

## Webhook state sync
- Listen to `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, and `customer.subscription.deleted` (do not grant access solely on the `/success` redirect URL).
- Verify `stripe-signature` using the **unparsed raw request Buffer** and `STRIPE_WEBHOOK_SECRET` before JSON parsing; deduplicate by `event.id` because webhooks arrive at-least-once and out of order.
- Derive product entitlements from active subscription status (`active`, `trialing`) and period end (`current_period_end`) in your DB; avoid checking Stripe's API on every user HTTP request.

## Idempotency and API pinning
Pass deterministic `idempotencyKey` options on invoice/refund/subscription mutations and pin your `Stripe` SDK `apiVersion`.

## Verify
Test locally with `stripe listen --forward-to ...` (`stripe trigger`), replaying duplicate/out-of-order events against Stripe test clocks for trials, renewals, upgrades, and cancellations.
