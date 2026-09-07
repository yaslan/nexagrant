import { NextResponse } from 'next/server';
import { generateDocxBuffer, generatePdfHtml } from '@/lib/document-exporter';
import { DEFAULT_PART_B_SECTIONS } from '@/modules/m11/types';
import { prisma } from '@/lib/db';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'NDA';
  const format = searchParams.get('format') || 'docx';
  const title = searchParams.get('title') || `${type} Document`;
  const partId = searchParams.get('partId');

  let sections: any[] = [];
  if (type === 'PART_B') {
    if (partId) {
      try {
        const part = await prisma.applicationPart.findUnique({ where: { id: partId } });
        if (part && (part.content)?.sections) {
          sections = (part.content).sections;
        }
      } catch (e) {
        sections = DEFAULT_PART_B_SECTIONS;
      }
    }
    if (sections.length === 0) {
      sections = DEFAULT_PART_B_SECTIONS;
    }
  }

  const docData = {
    id: `doc-export-${Date.now()}`,
    kind: type,
    title,
    opportunityTitle: 'HORIZON-CL5-2026-D3-01: Zero-Emission Transport Systems & Battery Tech',
    tenantName: 'FonBridge Teknoloji A.Ş.',
    version: 1,
    signedAt: new Date().toISOString(),
    sections: sections.length > 0 ? sections : undefined,
    contentText: `### ${type} RESMÎ BAŞVURU DOKÜMANI\n\nİşbu doküman resmî Ufuk Avrupa (Horizon Europe) ve TÜBİTAK Eşik Üstü Ödül Paketi standartlarına uygun olarak üretilmiştir.\n\n1. Taraflar ve Haklar\n2. Gizlilik ve Fikri Mülkiyet Beyanı\n3. Hüküm ve Yürürlük Tarihi: ${new Date().toLocaleDateString('tr-TR')}`,
  };

  if (format === 'docx') {
    const buffer = generateDocxBuffer(docData);
    const filename = `${type}_v1_${Date.now()}.docx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  // PDF / HTML Print format
  const html = generatePdfHtml(docData);
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}

