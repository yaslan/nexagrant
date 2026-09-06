import Stripe from 'stripe';
import { prisma } from '@/lib/db';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock');

/**
 * Creates or retrieves a Stripe customer portal session for subscription management.
 * Allows the tenant owner to manage billing, update payment method, view invoices, etc.
 */
export async function createPortalSession(
  tenantId: string,
  returnUrl: string
): Promise<string> {
  // Get tenant subscription
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
  });

  if (!subscription?.providerCustomerId) {
    throw new Error(
      `No Stripe customer found for tenant ${tenantId}. Please complete subscription setup first.`
    );
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.providerCustomerId,
      return_url: returnUrl,
    });

    return session.url;
  } catch (error) {
    console.error('Error creating portal session:', error);
    throw new Error('Failed to create billing portal session');
  }
}
