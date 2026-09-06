import { NextRequest, NextResponse } from 'next/server';
import { SediaAdapter } from '@/lib/adapters/sedia';
import { translateTopicsBatch } from '@/lib/translation';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const text = searchParams.get('q') || searchParams.get('text') || '***';
    const pageNumber = parseInt(searchParams.get('page') || searchParams.get('pageNumber') || '1', 10);
    const pageSize = parseInt(searchParams.get('limit') || searchParams.get('pageSize') || '20', 10);
    const lang = (searchParams.get('lang') || searchParams.get('locale') || 'tr').toLowerCase();
    
    // Status filter: 'OPEN', 'FORTHCOMING', 'CLOSED' or numeric codes ('31094501', '31094502', '31094503')
    const statusParam = searchParams.get('status');
    let statuses: string[] = ['31094501', '31094502']; // Default: Forthcoming and Open
    
    if (statusParam) {
      const parts = statusParam.split(',').map(s => s.trim().toUpperCase());
      const mapped: string[] = [];
      parts.forEach(p => {
        if (p === 'FORTHCOMING' || p === '31094501') mapped.push('31094501');
        if (p === 'OPEN' || p === '31094502') mapped.push('31094502');
        if (p === 'CLOSED' || p === '31094503') mapped.push('31094503');
      });
      if (mapped.length > 0) statuses = mapped;
    }

    // Framework Programme filter
    const frameworkParam = searchParams.get('framework');
    let frameworkProgrammes: string[] = [];
    if (frameworkParam && frameworkParam !== 'ALL') {
      frameworkProgrammes = frameworkParam.split(',').map(f => f.trim());
    }

    // Type: '1' (grants), '2' (tenders)
    const typeParam = searchParams.get('type') || '1';
    const types = typeParam.split(',').map(t => t.trim());

    const adapter = new SediaAdapter();
    const result = await adapter.searchSedia({
      text,
      pageNumber,
      pageSize,
      statuses,
      frameworkProgrammes,
      types,
      languages: [lang, 'en']
    });

    let processedTopics = result.topics;

    // If requested language is Turkish, translate titles & descriptions to Turkish
    if (lang === 'tr' && processedTopics.length > 0) {
      processedTopics = await translateTopicsBatch(processedTopics, 'tr');
    }

    // Asynchronously cache/upsert fetched topics to Prisma in background without blocking response
    if (processedTopics && processedTopics.length > 0) {
      (async () => {
        try {
          for (const t of processedTopics.slice(0, 10)) {
            await prisma.topic.upsert({
              where: { identifier: t.identifier },
              update: {
                title: t.title,
                status: t.status as any,
                typeOfAction: t.typeOfAction,
                isLumpSum: t.isLumpSum,
                isTwoStage: t.isTwoStage,
                deadlines: t.deadlines || [],
                nextDeadlineAt: t.nextDeadlineAt ? new Date(t.nextDeadlineAt) : null,
                sourceUrl: t.sourceUrl,
              },
              create: {
                identifier: t.identifier,
                title: t.title,
                status: (t.status as any) || 'OPEN',
                typeOfAction: t.typeOfAction,
                isLumpSum: t.isLumpSum || false,
                isTwoStage: t.isTwoStage || false,
                deadlines: t.deadlines || [],
                nextDeadlineAt: t.nextDeadlineAt ? new Date(t.nextDeadlineAt) : null,
                sourceUrl: t.sourceUrl,
                call: {
                  connectOrCreate: {
                    where: { callIdentifier: t.callIdentifier || 'HORIZON-DEFAULT' },
                    create: {
                      callIdentifier: t.callIdentifier || 'HORIZON-DEFAULT',
                      title: t.callTitle || 'Horizon Call',
                      programme: {
                        connectOrCreate: {
                          where: { id: 'HE' },
                          create: { id: 'HE', name: 'Horizon Europe', sourceKey: 'horizon' }
                        }
                      }
                    }
                  }
                }
              }
            }).catch(() => {});
          }
        } catch (e) {
          // Non-blocking sync error
        }
      })();
    }

    return NextResponse.json({
      success: true,
      totalResults: result.totalResults,
      pageNumber: result.pageNumber,
      pageSize: result.pageSize,
      topics: processedTopics
    });
  } catch (error: any) {
    console.error('[API /api/cagrilar] Internal error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch calls from SEDIA' },
      { status: 500 }
    );
  }
}

