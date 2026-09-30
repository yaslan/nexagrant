import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import unzipper from 'unzipper';
import type { ConceptNote, ConceptTemplate, Opportunity } from '@prisma/client';
import { partialRow } from '../../../../../../tests/helpers/partial-row';
import { MAX_IMAGE_BYTES, MAX_TOTAL_IMAGE_BYTES } from '@/lib/docx-safe-html';

/**
 * TASK-MUNDTW8O2IV6V — İNCELEME-53 follow-ups on the concept-note DOCX export, against the
 * REAL route and the REAL html-to-docx (only the database, the session and — for the last
 * test — one html-to-docx failure are faked):
 *   B-3 a Turkish/emoji opportunity title was a 500 (non-ByteString header);
 *   B-2 an image that passes the signature gate but not the bundled image-size was a 500;
 *   B-1 K4 the image budget must be one per DOCUMENT, not one per section.
 */

const mockPrisma = vi.hoisted(() => ({
  conceptNote: { findFirst: vi.fn() },
  opportunity: { findFirst: vi.fn() },
  conceptTemplate: { findFirst: vi.fn() },
}));
const docx = vi.hoisted(() => ({ failures: 0, calls: [] as string[] }));

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    assertTenantScope: actual.assertTenantScope,
    MissingTenantScopeError: actual.MissingTenantScopeError,
    prisma: mockPrisma,
    withTenant: async <T,>(_tenantId: string, cb: (tx: never) => Promise<T> | T) =>
      cb(mockPrisma as never),
  };
});
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
// Pass-through to the real library; `docx.failures` makes the next N calls throw the way the
// bundled image-size does, for the one path the sanitizer cannot reach in a test.
vi.mock('html-to-docx', async (importOriginal) => {
  const real = ((await importOriginal()) as { default: (...args: unknown[]) => Promise<unknown> }).default;
  return {
    default: async (html: string, ...rest: unknown[]) => {
      docx.calls.push(html);
      if (docx.failures > 0) {
        docx.failures--;
        throw new TypeError('Invalid JPG, marker table corrupted');
      }
      return real(html, ...rest);
    },
  };
});

import { GET } from './route';
import { auth } from '@/lib/auth';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
const GIF = readFileSync(join(process.cwd(), 'tests/fixtures/docx-images/12x8.gif'));
const img = (bytes: Buffer, type = 'png') => `<img src="data:image/${type};base64,${bytes.toString('base64')}">`;

beforeEach(() => {
  vi.clearAllMocks();
  docx.failures = 0;
  docx.calls.length = 0;
  vi.mocked(auth).mockResolvedValue({ tenantId: 'tenant_1' } as never);
});

function seed(content: Record<string, string>, title: string | null = 'Smart Grids') {
  mockPrisma.conceptNote.findFirst.mockResolvedValue(
    partialRow<ConceptNote>({ id: 'note_1', templateId: 'tpl_1', opportunityId: 'opp_1', content })
  );
  mockPrisma.opportunity.findFirst.mockResolvedValue(title === null ? null : partialRow<Opportunity>({ title }));
  mockPrisma.conceptTemplate.findFirst.mockResolvedValue(
    partialRow<ConceptTemplate>({
      id: 'tpl_1',
      name: 'Standard Template',
      schema: { sections: Object.keys(content).map((key) => ({ key, labelKey: key })) },
    })
  );
}

async function exportNote() {
  const res = await GET(new Request('https://example.test/api/concept-notes/note_1/export'), {
    params: Promise.resolve({ id: 'note_1' }),
  });
  const bytes = Buffer.from(await res.arrayBuffer());
  return { res, bytes };
}

async function documentXml(bytes: Buffer) {
  const zip = await unzipper.Open.buffer(bytes);
  return (await zip.files.find((f) => f.path === 'word/document.xml')!.buffer()).toString('utf8');
}
const pictures = (xml: string) => (xml.match(/<pic:pic\b/g) ?? []).length;

describe('concept-note DOCX export — İNCELEME-53 follow-ups (TASK-MUNDTW8O2IV6V)', () => {
  it('B-3: a Turkish + emoji title exports (200) with an RFC 5987 file name', async () => {
    const title = 'Çağrı: Kırsal İklim Öncüleri — ğüşıöç 🚀';
    seed({ summary: '<p>Özet metni</p>' }, title);
    const { res, bytes } = await exportNote();
    expect(res.status).toBe(200);
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    const header = res.headers.get('Content-Disposition')!;
    expect(header).toBe(
      `attachment; filename="Cagri_ Kirsal Iklim Onculeri gusioc.docx"; filename*=UTF-8''${encodeURIComponent('Çağrı_ Kırsal İklim Öncüleri — ğüşıöç 🚀.docx')}`
    );
    expect(await documentXml(bytes)).toContain('Opportunity: Çağrı: Kırsal İklim Öncüleri — ğüşıöç 🚀');
  });

  it('B-3: the "ConceptNote" fallback name still applies when the opportunity is gone', async () => {
    seed({ summary: 'x' }, null);
    const { res } = await exportNote();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toBe(
      `attachment; filename="ConceptNote.docx"; filename*=UTF-8''ConceptNote.docx`
    );
  });

  it('B-2: a broken GIF/PNG/JPEG is skipped — 200, the text and the good image stay', async () => {
    seed({
      summary: [
        '<p>önce</p>',
        img(Buffer.concat([Buffer.from('GIF8'), Buffer.alloc(20, 0x41)]), 'gif'),
        img(Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(24)])),
        img(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(40, 0x41)]), 'jpeg'),
        img(GIF, 'gif'),
        '<p>sonra</p>',
      ].join(''),
    });
    const { res, bytes } = await exportNote();
    expect(res.status).toBe(200);
    expect(docx.calls).toHaveLength(1); // no retry needed: the sanitizer dropped them
    const xml = await documentXml(bytes);
    expect(xml).toContain('önce');
    expect(xml).toContain('sonra');
    expect(pictures(xml)).toBe(1);
  });

  it('B-1 K4: the image budget is per document — two sections cannot each spend it', async () => {
    // 3 images of ~1.9 MiB per section: 5.7 MiB fits one section's budget, 11.4 MiB does not
    // fit the document's 8 MiB, so exactly 4 of the 6 must make it in.
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES - 100 * 1024 - PNG.length)]);
    expect(3 * big.length).toBeLessThan(MAX_TOTAL_IMAGE_BYTES);
    expect(Math.floor(MAX_TOTAL_IMAGE_BYTES / big.length)).toBe(4);
    const three = img(big).repeat(3);
    seed({ a: `<p>A</p>${three}`, b: `<p>B</p>${three}` });
    const { res, bytes } = await exportNote();
    expect(res.status).toBe(200);
    expect(pictures(await documentXml(bytes))).toBe(4);
  }, 60_000);

  it('B-2 net: if html-to-docx still throws on an image, the note is exported without images (200, not 500)', async () => {
    seed({ summary: `<p>metin</p>${img(PNG)}` });
    docx.failures = 1;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { res, bytes } = await exportNote();
    expect(res.status).toBe(200);
    expect(docx.calls).toHaveLength(2);
    expect(docx.calls[0]).toContain('<img ');
    expect(docx.calls[1]).not.toContain('<img');
    const xml = await documentXml(bytes);
    expect(xml).toContain('metin');
    expect(pictures(xml)).toBe(0);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('a failure that is not about images still surfaces (no silent second try hides it)', async () => {
    seed({ summary: '<p>metin</p>' });
    docx.failures = 2;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(exportNote()).rejects.toThrow('Invalid JPG');
    expect(docx.calls).toHaveLength(2);
  });
});
