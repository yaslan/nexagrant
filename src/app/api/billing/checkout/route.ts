import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import Stripe from 'stripe';
import { errorMessage } from '@/lib/errors';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const isLiveStripe = Boolean(stripeSecretKey && !stripeSecretKey.includes('mock') && stripeSecretKey.startsWith('sk_'));

const stripe = isLiveStripe ? new Stripe(stripeSecretKey!, {
  apiVersion: '2026-08-26.dahlia',
}) : null;

/**
 * One line of the checkout request body.
 *
 * NOTE: `price`/`originalPrice` arrive from the client and are what the Stripe
 * unit amount is computed from, so a caller can name its own price. Fixing
 * that needs a server-side catalogue lookup, which is a billing change rather
 * than a lint fix; recorded in the TASK-MTQ60SGW45T0X report.
 */
interface CheckoutItem {
  id: string;
  name: string;
  subtitle?: string;
  type: 'plan' | 'lifetime' | string;
  price: number;
  originalPrice?: number;
  discountPercent?: number;
  billingCycle?: 'monthly' | 'yearly' | string;
  quantity?: number;
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const tenantId = session?.tenantId || 'default-tenant';

    const body = await req.json();
    const { priceId, items, mode = 'subscription', couponCode, discountPercent, locale = 'tr', workspace = 'default' } = body;

    // Determine cart items or single item
    const checkoutItems: CheckoutItem[] = items && Array.isArray(items) && items.length > 0
      ? items
      : priceId
      ? [{ id: priceId, name: 'Plan/Add-on', price: 45, quantity: 1, type: mode === 'payment' ? 'lifetime' : 'plan' }]
      : [];

    if (checkoutItems.length === 0) {
      return NextResponse.json({ error: 'No items in checkout request' }, { status: 400 });
    }

    // If Stripe credentials are not live or missing, return demo mode status for client fallback
    if (!stripe || !isLiveStripe) {
      return NextResponse.json({
        demoMode: true,
        message: 'Stripe credentials not configured. Handled via interactive demo checkout modal.',
        itemsCount: checkoutItems.length,
        tenantId,
        couponCode,
      });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Map checkout items to Stripe line items
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = checkoutItems.map((item) => {
      const discount = item.type === 'lifetime' ? 50 : (item.discountPercent ?? discountPercent ?? 0);
      const unitAmountCents = Math.round((item.originalPrice || item.price) * (1 - discount / 100) * 100);

      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.name,
            description: item.subtitle || `${item.type.toUpperCase()} - Discount code: ${couponCode || 'N/A'} (-${discount}%)`,
          },
          unit_amount: Math.max(50, unitAmountCents),
          ...(item.type === 'plan' ? { recurring: { interval: item.billingCycle === 'yearly' ? 'year' : 'month' } } : {}),
        },
        quantity: item.quantity || 1,
      };
    });

    const isSubscriptionMode = checkoutItems.some((i) => i.type === 'plan');

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: isSubscriptionMode ? 'subscription' : 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      client_reference_id: tenantId,
      metadata: {
        tenantId,
        couponCode: couponCode || 'NONE',
        discountPercent: String(discountPercent || 0),
        itemTypes: checkoutItems.map((i) => i.type).join(','),
      },
      success_url: `${appUrl}/${locale}/${workspace}/settings/billing?success=true`,
      cancel_url: `${appUrl}/${locale}/${workspace}/settings/billing?canceled=true`,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
