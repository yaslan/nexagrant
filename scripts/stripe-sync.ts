import { prisma } from '../src/lib/db';
import Stripe from 'stripe';

// Initialize Stripe with the secret key from environment
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock', {
  apiVersion: '2026-08-26.dahlia',
});

async function syncPlans() {
  console.log('Syncing Plans to Stripe...');
  const plans = await prisma.plan.findMany();

  for (const plan of plans) {
    // `free` is the no-subscription fallback, not a purchasable plan, so it has
    // nothing to sync. (`enterprise` used to be skipped here too — it was a
    // contract-priced tier and was retired with the EUR ladder.)
    if (plan.id === 'free') continue;

    // Create or retrieve product
    const productId = `prod_${plan.id}`;
    let product;
    try {
      product = await stripe.products.retrieve(productId);
    } catch (e) {
      product = await stripe.products.create({
        id: productId,
        name: `Fabrika - ${plan.name}`,
      });
      console.log(`Created Stripe product for plan: ${plan.id}`);
    }

    // Since we can't easily update price amounts in Stripe, we create them if missing.
    // In a real scenario, we'd map our DB price IDs directly.
    if (!plan.stripePriceMonthly && plan.monthlyCents > 0) {
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.monthlyCents,
        currency: plan.currency.toLowerCase(),
        recurring: { interval: 'month' },
      });
      await prisma.plan.update({
        where: { id: plan.id },
        data: { stripePriceMonthly: price.id }
      });
      console.log(`Created monthly price for ${plan.id}: ${price.id}`);
    }

    if (!plan.stripePriceYearly && plan.yearlyCents > 0) {
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.yearlyCents,
        currency: plan.currency.toLowerCase(),
        recurring: { interval: 'year' },
      });
      await prisma.plan.update({
        where: { id: plan.id },
        data: { stripePriceYearly: price.id }
      });
      console.log(`Created yearly price for ${plan.id}: ${price.id}`);
    }
  }
}

async function syncAddOns() {
  console.log('Syncing Add-ons to Stripe...');
  const addOns = await prisma.addOnCatalog.findMany();

  for (const addon of addOns) {
    const productId = `prod_${addon.sku}`;
    let product;
    try {
      product = await stripe.products.retrieve(productId);
    } catch (e) {
      product = await stripe.products.create({
        id: productId,
        name: `Fabrika Add-on - ${addon.name}`,
      });
      console.log(`Created Stripe product for add-on: ${addon.sku}`);
    }

    if (!addon.stripePriceId) {
      if (addon.monthlyCents) {
        const price = await stripe.prices.create({
          product: product.id,
          unit_amount: addon.monthlyCents,
          currency: addon.currency.toLowerCase(),
          recurring: { interval: 'month' },
        });
        await prisma.addOnCatalog.update({
          where: { sku: addon.sku },
          data: { stripePriceId: price.id }
        });
        console.log(`Created monthly price for ${addon.sku}: ${price.id}`);
      } else if (addon.oneTimeCents) {
        const price = await stripe.prices.create({
          product: product.id,
          unit_amount: addon.oneTimeCents,
          currency: addon.currency.toLowerCase(),
        });
        await prisma.addOnCatalog.update({
          where: { sku: addon.sku },
          data: { stripePriceId: price.id }
        });
        console.log(`Created one-time price for ${addon.sku}: ${price.id}`);
      }
    }
  }
}

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('STRIPE_SECRET_KEY is missing. Using mock key, API calls will fail if not using stripe-mock.');
  }

  await syncPlans();
  await syncAddOns();
  console.log('Stripe sync completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
