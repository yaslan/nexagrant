import { NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { UnsupportedCycleError, type PricedLine } from '@/lib/billing/catalog';
import { PlanNotAvailableError, priceLineForTenant } from '@/lib/billing/storefront';
import { getActiveTier } from '@/lib/billing/active-tier';
import { tierForTenant } from '@/lib/billing/tenant-tier';

/**
 * What a cart costs — the same answer `POST /api/billing/checkout` will give,
 * without starting a payment.
 *
 * Why it exists (TASK-MTSHVKTSGC8A4): the cart drawer priced its lines in the
 * browser from the static catalogue in `src/lib/billing/catalog.ts`. Once plan
 * prices come from the published `PlanVersion` rows the studio writes, a
 * browser-side figure is a guess: a plan repriced in the studio would show the
 * old number in the drawer and charge the new one at checkout — a visitor
 * reading one price and paying another, which is precisely the class of bug
 * TASK-MTR6Q2IODYQRC closed on the server side.
 *
 * The request says *which* lines. It cannot say how much, and nothing in the
 * body is read as an amount.
 */

const QuoteItemSchema = z.object({
  sku: z.string().min(1),
  quantity: z.number().int().min(1).max(999).optional(),
  billingCycle: z.enum(['monthly', 'yearly', 'one-time']).optional(),
});

const QuoteBodySchema = z.object({
  items: z.array(QuoteItemSchema).max(50),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    const tenantId = session?.tenantId ?? null;

    const parsed = QuoteBodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid quote request',
          details: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        },
        { status: 400 }
      );
    }

    // Same tier resolution as checkout, from the same function — a drawer that
    // quoted the shopfront campaign while checkout applied the tenant's locked
    // rate would be the mismatch in a new costume.
    const tier = tenantId ? await tierForTenant(tenantId) : null;
    const activeTier = tier?.effective ?? getActiveTier();

    const lines: PricedLine[] = [];
    /**
     * Skus this viewer may not buy. Named back so the drawer can drop the row
     * and say so, rather than showing a line the checkout will refuse. It is
     * not an enumeration risk: the caller already knew the sku it asked about.
     */
    const unavailable: string[] = [];

    for (const item of parsed.data.items) {
      try {
        lines.push(await priceLineForTenant(item, activeTier, tenantId));
      } catch (error) {
        if (error instanceof PlanNotAvailableError || error instanceof UnsupportedCycleError) {
          unavailable.push(item.sku);
          continue;
        }
        throw error;
      }
    }

    const subtotalMinor = lines.reduce(
      (sum, line) => sum + line.listAmountMinor * line.quantity,
      0
    );
    const totalMinor = lines.reduce((sum, line) => sum + line.totalMinor, 0);

    return NextResponse.json({
      lines,
      unavailable,
      subtotalMinor,
      discountMinor: subtotalMinor - totalMinor,
      totalMinor,
      currency: lines[0]?.currency ?? 'USD',
      activeTier: { code: activeTier.code, percentOff: activeTier.percentOff },
      priceLocked: tier?.locked ?? false,
    });
  } catch (error) {
    logger.error('Error quoting a cart', error);
    return internalError();
  }
}
