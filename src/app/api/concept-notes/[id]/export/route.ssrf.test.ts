import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { writeFileSync } from 'node:fs';
import unzipper from 'unzipper';
import HTMLtoDOCX from 'html-to-docx';
import type { ConceptNote, ConceptTemplate, Opportunity } from '@prisma/client';
import { partialRow } from '../../../../../../tests/helpers/partial-row';

/**
 * TASK-MUN80RJ96EG0O (Y-1 of TASK-MUN66T2HM4A4E): the export route used to hand
 * tenant-written HTML to html-to-docx, which downloads `<img src="http(s)://…">`
 * FROM THE SERVER. These tests run the REAL route and the REAL html-to-docx
 * against a REAL listener on 127.0.0.1 and count the requests it receives — the
 * database and session are the only fakes.
 */

const mockPrisma = vi.hoisted(() => ({
  conceptNote: { findFirst: vi.fn() },
  opportunity: { findFirst: vi.fn() },
  conceptTemplate: { findFirst: vi.fn() },
}));

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

import { GET } from './route';
import { auth } from '@/lib/auth';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const hits: string[] = [];
let server: http.Server;
let base = '';

beforeAll(async () => {
  // Stands in for an internal service / metadata endpoint. `/hop` redirects
  // inward, like a public URL that 302s to 169.254.169.254.
  server = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    if (req.url?.startsWith('/hop')) {
      res.writeHead(302, { location: '/internal/secret.png' });
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end(PNG);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  vi.clearAllMocks();
  hits.length = 0;
  vi.mocked(auth).mockResolvedValue({ tenantId: 'tenant_1' } as never);
});

function seed(content: Record<string, string>, title = 'Smart Grids', templateName = 'Standard Template') {
  mockPrisma.conceptNote.findFirst.mockResolvedValue(
    partialRow<ConceptNote>({ id: 'note_1', templateId: 'tpl_1', opportunityId: 'opp_1', content })
  );
  mockPrisma.opportunity.findFirst.mockResolvedValue(partialRow<Opportunity>({ title }));
  mockPrisma.conceptTemplate.findFirst.mockResolvedValue(
    partialRow<ConceptTemplate>({
      id: 'tpl_1',
      name: templateName,
      schema: { sections: Object.keys(content).map((key) => ({ key, labelKey: key })) },
    })
  );
}

async function exportNote() {
  const res = await GET(new Request('https://example.test/api/concept-notes/note_1/export'), {
    params: Promise.resolve({ id: 'note_1' }),
  });
  return { res, bytes: Buffer.from(await res.arrayBuffer()) };
}

async function docxParts(bytes: Buffer) {
  const zip = await unzipper.Open.buffer(bytes);
  const text = await zip.files.find((f) => f.path === 'word/document.xml')!.buffer();
  return { media: zip.files.filter((f) => f.type === 'File' && f.path.startsWith('word/media/')), xml: text.toString('utf8') };
}

describe('concept-note DOCX export — SSRF', () => {
  it('control: the listener DOES receive html-to-docx downloads (so zero below is meaningful)', async () => {
    await HTMLtoDOCX(`<p>x</p><img src="http://${base}/control.png">`, null, {});
    expect(hits).toContain('GET /control.png');
  });

  it('control: html-to-docx follows a redirect chain inward', async () => {
    await HTMLtoDOCX(`<p>x</p><img src="http://${base}/hop.png">`, null, {});
    // The library processes each <img> more than once, so each URL is fetched twice.
    expect(hits).toContain('GET /hop.png');
    expect(hits).toContain('GET /internal/secret.png');
  });

  const payloads: Record<string, (b: string) => string> = {
    'internal IP': (b) => `<p>x</p><img src="http://${b}/internal/secret.png">`,
    'redirect chain': (b) => `<img src="http://${b}/hop.png">`,
    'name that resolves to loopback (rebinding-style)': (b) =>
      `<img src="http://localhost:${b.split(':')[1]}/internal/rebind.png">`,
    'decimal IPv4': (b) => `<img src="http://2130706433:${b.split(':')[1]}/internal/dec.png">`,
    'uppercase / unquoted': (b) => `<IMG SRC=http://${b}/internal/upper.png>`,
    'data URI with a URL tail': (b) =>
      `<img src="data:image/png;base64,${PNG.toString('base64')}#http://${b}/internal/tail.png">`,
    'srcset + picture': (b) =>
      `<picture><source srcset="http://${b}/s.png"><img src="http://${b}/p.png"></picture>`,
  };

  it.each(Object.entries(payloads))('section body — %s: listener gets 0 requests', async (_name, make) => {
    seed({ summary: make(base) });
    const { res } = await exportNote();
    expect(res.status).toBe(200);
    expect(hits).toEqual([]);
  });

  it('opportunity title and template name are text, not markup: 0 requests', async () => {
    seed(
      { summary: 'body' },
      `T<img src="http://${base}/internal/title.png">`,
      `N<img src="http://${base}/internal/name.png">`
    );
    const { res, bytes } = await exportNote();
    expect(res.status).toBe(200);
    expect(hits).toEqual([]);
    expect((await docxParts(bytes)).xml).toContain('Opportunity: T&lt;img');
  });

  it('a legitimate export still produces a real DOCX with its text and inline image', async () => {
    seed({
      summary: `<h2>Summary</h2><p>Rural <strong>grid</strong> pilot &amp; results</p><img src="data:image/png;base64,${PNG.toString('base64')}">`,
      budget: '**Total** 1.2M EUR',
    });
    const { res, bytes } = await exportNote();
    expect(res.status).toBe(200);
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    const { media, xml } = await docxParts(bytes);
    // html-to-docx writes the one image into several media parts; each must be our PNG.
    expect(media.length).toBeGreaterThan(0);
    for (const part of media) expect((await part.buffer()).equals(PNG)).toBe(true);
    expect(xml).toContain('Rural ');
    expect(xml).toContain('grid');
    expect(xml).toContain('**Total** 1.2M EUR');
    expect(hits).toEqual([]);
    if (process.env.DOCX_EXPORT_SAMPLE) writeFileSync(process.env.DOCX_EXPORT_SAMPLE, bytes);
  });
});
