import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
  typescript: true,
});

/**
 * Two types of charges in Premura:
 *  1. Monthly subscription per property (recurring, Stripe Subscriptions) — tiered pricing €9.99/€7.99/€5.99 + 30-day no-card trial
 *  2. Per-kit charge at cost + €0.75 service fee (off-session via saved payment method)
 *
 * Per-kit charges use off_session=true because the host pre-authorized during onboarding.
 * This requires strong customer authentication (SCA) during first setup.
 */

// ===== CUSTOMER MANAGEMENT =====

export async function createCustomer(input: {
  hostId: string;
  email: string;
  fullName?: string;
}): Promise<{ customerId: string }> {
  const customer = await stripe.customers.create({
    email: input.email,
    name: input.fullName,
    metadata: { hostId: input.hostId },
  });
  return { customerId: customer.id };
}

// ===== SUBSCRIPTION =====

export async function createSubscription(input: {
  customerId: string;
  priceId: string; // Stripe Price ID for the tiered monthly subscription
  trialDays?: number;
}): Promise<{ subscriptionId: string; status: string; clientSecret?: string }> {
  const sub = await stripe.subscriptions.create({
    customer: input.customerId,
    items: [{ price: input.priceId }],
    trial_period_days: input.trialDays,
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.payment_intent'],
  });

  const invoice = sub.latest_invoice as Stripe.Invoice | null;
  const pi = invoice?.payment_intent as Stripe.PaymentIntent | null | string;
  const clientSecret = typeof pi === 'object' && pi ? pi.client_secret ?? undefined : undefined;

  return { subscriptionId: sub.id, status: sub.status, clientSecret };
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  await stripe.subscriptions.cancel(subscriptionId);
}

// ===== PER-KIT CHARGE (off-session) =====

export async function chargeForKit(input: {
  customerId: string;
  amountEurCents: number; // e.g. 1250 for €12.50
  bookingId: string;
  kitId: string;
  description: string; // e.g. "Kit Anna — Falanghina + sfogliatelle"
}): Promise<{ paymentIntentId: string; status: string }> {
  const pi = await stripe.paymentIntents.create({
    customer: input.customerId,
    amount: input.amountEurCents,
    currency: 'eur',
    off_session: true,
    confirm: true,
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    description: input.description,
    metadata: {
      bookingId: input.bookingId,
      kitId: input.kitId,
      type: 'kit_charge',
    },
  });

  return { paymentIntentId: pi.id, status: pi.status };
}

// ===== CLEANER PAYOUT (Stripe Connect — optional, phase 2) =====
// For now we pay cleaners via bank transfer at end of month.
// When we have >500 hosts, migrate to Stripe Connect Express accounts.

// ===== WEBHOOK VERIFICATION =====

export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string,
  secret: string = process.env.STRIPE_WEBHOOK_SECRET ?? '',
): Stripe.Event {
  return stripe.webhooks.constructEvent(payload, signature, secret);
}
