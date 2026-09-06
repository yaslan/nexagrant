import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import Stripe from 'stripe';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const isLiveStripe = Boolean(stripeSecretKey && !stripeSecretKey.includes('mock') && stripeSecretKey.startsWith('sk_'));

const stripe = isLiveStripe ? new Stripe(stripeSecretKey!, {
  // @ts-ignore
  apiVersion: '2026-08-26.dahlia',
}) : null;

export async function POST(req: Request) {
  try {
    const session = await auth();
    const tenantId = (session as any)?.tenantId || 'default-tenant';

    const body = await req.json();
    const { priceId, items, mode = 'subscription', couponCode, discountPercent, locale = 'tr', workspace = 'default' } = body;

    // Determine cart items or single item
    const checkoutItems = items && Array.isArray(items) && items.length > 0
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
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = checkoutItems.map((item: any) => {
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

    const isSubscriptionMode = checkoutItems.some((i: any) => i.type === 'plan');

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: isSubscriptionMode ? 'subscription' : 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      client_reference_id: tenantId,
      metadata: {
        tenantId,
        couponCode: couponCode || 'NONE',
        discountPercent: String(discountPercent || 0),
        itemTypes: checkoutItems.map((i: any) => i.type).join(','),
      },
      success_url: `${appUrl}/${locale}/${workspace}/settings/billing?success=true`,
      cancel_url: `${appUrl}/${locale}/${workspace}/settings/billing?canceled=true`,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
