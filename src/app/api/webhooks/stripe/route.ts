import { NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import Stripe from 'stripe';
import {
  syncStripeSubscription,
  handleSubscriptionCancellation,
  logInvoicePayment,
} from '@/lib/billing/subscription-sync';
import { recordLifetimeLicence } from '@/lib/billing/lifetime-licence';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock');

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature') as string;

  let event: Stripe.Event;

  // Neither answer tells an unauthenticated caller how the endpoint is set up
  // (İNCELEME-75 D-2): the old 400 said `Missing STRIPE_WEBHOOK_SECRET` or
  // quoted the SDK's verification text. The detail is in the log. Stripe
  // retries every non-2xx, so a missing secret still recovers once it is set —
  // and as our fault, not the sender's, it is a 5xx.
  if (!webhookSecret) {
    console.error('[stripe webhook] rejected: STRIPE_WEBHOOK_SECRET is not set');
    return internalError({ error: 'service_unavailable' }, { status: 503 });
  }

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`Webhook signature verification failed: ${error.message}`);
    return new NextResponse('invalid_signature', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.subscription && typeof session.subscription === 'string') {
          const subscriptionId = session.subscription;

          const subscription = await stripe.subscriptions.retrieve(
            subscriptionId
          );

          const result = await syncStripeSubscription(subscription, event.id);

          console.log(
            `Checkout completed: tenant=${result.tenantId}, plan=${result.planId}, credits=${result.creditsGranted}`
          );
          break;
        }

        // No subscription on the session: this is a one-time payment. Before
        // TASK-MTR962OV5YGVX the branch ended above and a `lifetime-ultra`
        // purchase was collected and then written down nowhere — which is also
        // why the pricing page had to invent its "5 licence owners".
        const licence = await recordLifetimeLicence(session, event.id);
        console.log(
          `One-time checkout completed: session=${session.id}, lifetime=${licence.status}` +
            (licence.seq ? `, licence=#${licence.seq}, tenant=${licence.tenantId}` : '')
        );
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;

        const result = await syncStripeSubscription(subscription, event.id);

        console.log(
          `Subscription updated: tenant=${result.tenantId}, plan=${result.planId}, status=${result.status}, added=${result.addedAddOns.length}, removed=${result.removedAddOns.length}`
        );
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;

        const result = await handleSubscriptionCancellation(
          subscription,
          event.id
        );

        console.log(`Subscription canceled: tenant=${result.tenantId}`);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;

        await logInvoicePayment(invoice, event.id);

        console.log(`Invoice payment succeeded: invoice=${invoice.id}`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`Error processing webhook: ${err.message}`, error);
    // Don't return 500 for already-processed events (idempotency)
    if (err.message?.includes('already processed')) {
      return NextResponse.json({ received: true });
    }
    // The detail is logged above; Stripe only needs the non-2xx to retry
    // (İNCELEME-70 Y-1, TASK-MUNVVMJDEO932).
    return internalError();
  }

  return NextResponse.json({ received: true });
}
