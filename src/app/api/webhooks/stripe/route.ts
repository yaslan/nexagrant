import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import {
  syncStripeSubscription,
  handleSubscriptionCancellation,
  logInvoicePayment,
} from '@/lib/billing/subscription-sync';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock', {
  // @ts-ignore
  apiVersion: '2026-08-26.dahlia',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature') as string;

  let event: Stripe.Event;

  try {
    if (!webhookSecret) {
      throw new Error('Missing STRIPE_WEBHOOK_SECRET');
    }
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
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
        }
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
  } catch (error: any) {
    console.error(`Error processing webhook: ${error.message}`, error);
    // Don't return 500 for already-processed events (idempotency)
    if (error.message?.includes('already processed')) {
      return NextResponse.json({ received: true });
    }
    return new NextResponse(`Error processing webhook: ${error.message}`, {
      status: 500,
    });
  }

  return NextResponse.json({ received: true });
}
