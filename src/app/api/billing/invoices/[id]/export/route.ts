import { NextResponse } from 'next/server';
import {
  EfaturaDocument,
  generateUblTrXml,
  generateEfaturaHtml,
} from '@/lib/efatura';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') || 'pdf'; // 'xml' | 'pdf' | 'html'

  // Standard demo Turkish E-Invoice document
  const invoiceDoc: EfaturaDocument = {
    id,
    uuid: 'c8f3b4a1-7d2e-4b9c-8a1f-3e5d7c9b0a2f',
    issueDate: '2026-09-01',
    issueTime: '14:30:00',
    profileId: 'TICARIFATURA',
    invoiceType: 'SATIS',
    currency: 'TRY',
    supplier: {
      name: 'Fabrika Teknoloji Anonim Şirketi',
      vknTckn: '3810459281', // 10-digit VKN
      taxOffice: 'Maslak Vergi Dairesi',
      address: 'Büyükdere Cad. No: 195 K:8 Şişli',
      city: 'İstanbul',
      country: 'Türkiye',
      email: 'muhasebe@fonbridge.app',
      isEfaturaUser: true,
    },
    customer: {
      name: 'FonBridge Teknoloji Anonim Şirketi',
      vknTckn: '3880194821',
      taxOffice: 'Maslak Vergi Dairesi',
      address: 'Büyükdere Cad. No:199 Levent, 34394 İstanbul / Türkiye',
      city: 'İstanbul',
      country: 'Türkiye',
      email: 'fatura@fonbridge.app',
      isEfaturaUser: true,
    },
    lines: [
      {
        id: '1',
        name: 'FonBridge SaaS Platformu - İşletme Planı Aboneliği (1 Aylık)',
        quantity: 1,
        unitCode: 'C62',
        unitPriceTRY: 21500.0,
        vatRate: 20,
      },
      {
        id: '2',
        name: 'M11 Full Application Production Eklentisi (1 Aylık Lisans)',
        quantity: 1,
        unitCode: 'C62',
        unitPriceTRY: 5350.0,
        vatRate: 20,
      },
    ],
  };

  if (format === 'xml') {
    const xml = generateUblTrXml(invoiceDoc);
    return new NextResponse(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${id}_UBL_TR.xml"`,
      },
    });
  }

  // PDF / HTML Print format
  const html = generateEfaturaHtml(invoiceDoc);
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
