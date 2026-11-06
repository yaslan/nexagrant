import { NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { auth } from '@/lib/auth';
import { asRole, can } from '@/lib/rbac';
import { withTenant } from '@/lib/db';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';
import { generateUblTrXml, generateEfaturaHtml, type InvoiceLocale } from '@/lib/efatura';
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
 *   - role without manage_billing → 403 FORBIDDEN_ROLE, before any read (NG-64 review B-1):
 *                                   the billing page that links here is the owner's alone
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

  // Which language the *printed page* is rendered in. Same shape as
  // `src/app/api/documents/export/route.ts`, and Turkish unless English is asked
  // for explicitly, so a link without the parameter keeps rendering what it did.
  //
  // It reaches only `generateEfaturaHtml`. The XML is the document filed with GİB
  // and has no locale: its element names and `cbc:Note` are fixed by UBL-TR, so
  // this parameter cannot change a byte of what is filed (TASK-MTTUSZF4QSFGU).
  const locale: InvoiceLocale = searchParams.get('locale') === 'en' ? 'en' : 'tr';

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const tenantId = session.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: 'no_tenant' }, { status: 403 });
  }

  if (!can(asRole(session.role), 'manage_billing')) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN_ROLE' }, { status: 403 });
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
    return internalError({ error: 'invoice_lookup_failed' });
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
      // Deliberately loud and specific in the log: an operator reading it
      // knows exactly which variables to fill in. The response body stays
      // generic — `missing` used to ship the env var names straight to the
      // customer's browser (TASK-MTUH6YKP6OQAX).
      logger.error('invoice supplier identity not configured', { missing: error.missing });
      return internalError({ error: 'supplier_identity_not_configured' }, { status: 503 });
    }
    if (error instanceof InvoiceLinesInvalidError) {
      logger.error('stored invoice lines unreadable', { invoice: id, detail: error.detail });
      return internalError({ error: 'invoice_lines_invalid' });
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

  return new NextResponse(generateEfaturaHtml(document, locale), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });
}
