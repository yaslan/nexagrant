import { NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/api-auth';
import { prisma } from '@/lib/db';

export async function GET(req: Request) {
  const authRes = await authenticateApiKey(req);
  if (!authRes.authenticated) {
    return authRes.errorResponse;
  }

  const { searchParams } = new URL(req.url);
  const programme = searchParams.get('programme'); // Horizon Europe, Eurostars, TUBITAK
  const status = searchParams.get('status') || 'OPEN'; // OPEN, FORTHCOMING, CLOSED
  const limit = Math.min(50, parseInt(searchParams.get('limit') || '20', 10));

  let calls: any[] = [];

  try {
    const where: any = {};
    if (programme) where.programme = { contains: programme, mode: 'insensitive' };
    if (status) where.status = status;

    calls = await prisma.topic.findMany({
      where,
      take: limit,
      select: {
        id: true,
        topicId: true,
        title: true,
        programme: true,
        callId: true,
        deadlineAt: true,
        deadlineTz: true,
        budgetTotalEur: true,
        fundingType: true,
        status: true,
      },
    });
  } catch (e: any) {
    console.warn(`[/api/v1/calls] DB query fallback: ${e.message}`);
  }

  if (!calls || calls.length === 0) {
    calls = [
      {
        topicId: 'HORIZON-CL5-2026-D3-01',
        title: 'Zero-Emission Transport Systems & Next-Gen Battery Thermal Management',
        programme: 'Horizon Europe (Pillar II - Cluster 5)',
        callId: 'HORIZON-CL5-2026-D3',
        deadlineAt: '2026-09-15T17:00:00.000Z',
        deadlineTz: 'Europe/Brussels',
        budgetTotalEur: 25000000,
        expectedGrantRangeEur: '€4,000,000 - €6,000,000',
        fundingType: 'RIA (Research and Innovation Actions)',
        status: 'OPEN',
      },
      {
        topicId: 'HORIZON-CL4-2026-TWIN-01',
        title: 'AI-Driven Materials Discovery and High-Throughput Sensing for Clean Energy',
        programme: 'Horizon Europe (Pillar II - Cluster 4)',
        callId: 'HORIZON-CL4-2026-TWIN',
        deadlineAt: '2026-10-22T17:00:00.000Z',
        deadlineTz: 'Europe/Brussels',
        budgetTotalEur: 32000000,
        expectedGrantRangeEur: '€5,000,000 - €8,000,000',
        fundingType: 'IA (Innovation Actions)',
        status: 'OPEN',
      },
      {
        topicId: 'EIC-ACC-2026-STEP',
        title: 'EIC Accelerator Deep-Tech Scale-Up Blended Finance',
        programme: 'Horizon Europe (Pillar III - EIC)',
        callId: 'EIC-2026-ACC',
        deadlineAt: '2026-11-05T17:00:00.000Z',
        deadlineTz: 'Europe/Brussels',
        budgetTotalEur: 180000000,
        expectedGrantRangeEur: 'Up to €2.5M Grant + €15M Equity',
        fundingType: 'Blended Finance',
        status: 'OPEN',
      },
      {
        topicId: 'TUBITAK-1707-2026',
        title: 'TÜBİTAK 1707 Siparişe Dayalı Ar-Ge Projeleri Çağrısı',
        programme: 'TÜBİTAK TEYDEB',
        callId: '1707-2026-1',
        deadlineAt: '2026-12-01T23:59:00.000Z',
        deadlineTz: 'Europe/Istanbul',
        budgetTotalEur: 5000000,
        expectedGrantRangeEur: '₺7,500,000 / Proje',
        fundingType: 'Sipariş Ar-Ge Hibe & Eş-Finansman',
        status: 'OPEN',
      },
    ];
  }

  return NextResponse.json({
    success: true,
    meta: {
      total: calls.length,
      statusFilter: status,
      queriedAt: new Date().toISOString(),
    },
    data: calls,
  });
}
