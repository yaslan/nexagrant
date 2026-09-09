import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';
import { generateUblTrXml, generateEfaturaHtml } from '@/lib/efatura';
import {
  buildInvoiceDocument,
  InvoiceLinesInvalidError,
  SupplierNotConfiguredError,
  type InvoiceRecord,
} from './invoice-document';

/**
 * Export one invoice the tenant actually holds.
 *
 * This route used to answer 200 to anybody — no session, any id — with a
 * Turkish e-Invoice assembled from constants in this file: ETTN
 * c8f3b4a1-…, supplier VKN 3810459281 at "Maslak Vergi Dairesi",
 * `isEfaturaUser: true`, two invented lines totalling ₺32,220, and a footer
 * stating the document had been produced under VUK 213 and sealed. None of it
 * existed anywhere (TASK-MTRD9QBJ2G32E).
 *
 * Now it reads one row, and only one:
 *   - no session                  → 401
 *   - session with no tenant      → 403 (a user with no membership has no invoices)
 *   - id not in *this* tenant     → 404, the same answer as an id that exists nowhere,
 *                                   so the route cannot be used to probe another tenant
 *   - seller identity unset       → 503, naming the settings, rather than a plausible VKN
 *
 * The query runs inside `withTenant`, so the RLS policy on `Invoice` is the
 * second lock behind the `tenantId` in the where clause.
 */

const FORMATS = ['xml', 'pdf', 'html'] as const;
type Format = (typeof FORMATS)[number];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const requested = searchParams.get('format') ?? 'pdf';

  if (!(FORMATS as readonly string[]).includes(requested)) {
    return NextResponse.json(
      { error: 'unsupported_format', supported: FORMATS },
      { status: 400 }
    );
  }
  const format = requested as Format;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const tenantId = session.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: 'no_tenant' }, { status: 403 });
  }

  let record: InvoiceRecord | null;
  try {
    record = await withTenant(tenantId, (tx) =>
      tx.invoice.findFirst({
        // `id` in the path is the invoice number the customer sees; the row's
        // own primary key is accepted too, so a link built from either works.
        // Both are filtered by tenant — an invoice number alone is not a
        // capability.
        where: { tenantId, OR: [{ number: id }, { id }] },
        select: {
          number: true,
          issuedAt: true,
          currency: true,
          buyerName: true,
          buyerVknTckn: true,
          buyerTaxOffice: true,
          buyerAddress: true,
          buyerCity: true,
          buyerCountry: true,
          lines: true,
          profileId: true,
          invoiceType: true,
          ettn: true,
          gibEnvelopeId: true,
          // The TCMB rate the document was issued at (ADR-0002). Without these
          // a foreign-currency document carries no TL equivalent, and
          // `foreignCurrencyFilingBlock` refuses to let it be filed.
          fxRate: true,
          fxRateDate: true,
          fxRateSource: true,
          grandTotalTryMinor: true,
        },
      })
    );
  } catch (error) {
    logger.error('invoice export lookup failed', { tenantId, invoice: id, error });
    return NextResponse.json({ error: 'invoice_lookup_failed' }, { status: 500 });
  }

  if (!record) {
    return NextResponse.json({ error: 'invoice_not_found' }, { status: 404 });
  }

  let document;
  try {
    document = buildInvoiceDocument(record, {
      name: env.INVOICE_SUPPLIER_NAME,
      vknTckn: env.INVOICE_SUPPLIER_VKN,
      taxOffice: env.INVOICE_SUPPLIER_TAX_OFFICE,
      address: env.INVOICE_SUPPLIER_ADDRESS,
      city: env.INVOICE_SUPPLIER_CITY,
      country: env.INVOICE_SUPPLIER_COUNTRY,
      email: env.INVOICE_SUPPLIER_EMAIL,
    });
  } catch (error) {
    if (error instanceof SupplierNotConfiguredError) {
      // Deliberately loud and specific: an operator reading this knows exactly
      // which variables to fill in, and no document goes out meanwhile.
      logger.error('invoice supplier identity not configured', { missing: error.missing });
      return NextResponse.json(
        { error: 'supplier_identity_not_configured', missing: error.missing },
        { status: 503 }
      );
    }
    if (error instanceof InvoiceLinesInvalidError) {
      logger.error('stored invoice lines unreadable', { invoice: id, detail: error.detail });
      return NextResponse.json({ error: 'invoice_lines_invalid' }, { status: 500 });
    }
    throw error;
  }

  if (format === 'xml') {
    return new NextResponse(generateUblTrXml(document), {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${record.number}_UBL_TR.xml"`,
        'Cache-Control': 'private, no-store',
      },
    });
  }

  return new NextResponse(generateEfaturaHtml(document), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });
}
