import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test, expect, vi, beforeEach } from 'vitest';

/**
 * TASK-MTQYXISOPUJ53 — fabricated data fallbacks.
 *
 * A recurring bug in this repo: a page, action or route that answers "no data"
 * — an empty table, an unseeded database, a thrown query, a failed LLM call —
 * by serving hard-coded rows that look exactly like real ones. CLAUDE.md rule 7
 * says every figure a user sees is backed by a record; each of these served
 * figures no record ever produced.
 *
 * Two kinds of test live here:
 *   - source guards, for server components that cannot be rendered without a
 *     database. They are weak on their own — they pin the specific invented
 *     strings so the constant cannot quietly come back — and each names the
 *     screen it protects.
 *   - real behavioural tests, where the unit can be executed.
 */

const REPO = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');

/**
 * The guards below match on invented strings, and each fixed file now carries a
 * comment quoting the very strings it removed — so the guards must read code,
 * not prose. Block comments (JSX `{/* … *\/}` included) and line comments are
 * stripped; `://` is left alone so a URL is not mistaken for a comment.
 */
function codeOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const readCode = (rel: string) => codeOf(read(rel));

describe('M1 partners page — the demo CORDIS dataset is gone', () => {
  const source = readCode('src/app/[locale]/(app)/[workspace]/partners/page.tsx');

  test('carries none of the six invented institutions it used to list', () => {
    for (const invented of [
      'DEMO_CORDIS_PARTNERS',
      'demo_cordis_dataset',
      '999908205',
      'MIDDLE EAST TECHNICAL UNIVERSITY (METU)',
      'ARÇELİK A.Ş.',
      'BigInt(24500000)',
      'BigInt(260000000)',
    ]) {
      expect(source).not.toContain(invented);
    }
  });

  test('does not report an unknown participation count as 1, or an unknown grant as 0', () => {
    // The CordisOrganization step used to normalise every row to
    // `totalProjects: 1, coordinatorProjects: 0, totalEcContribution: BigInt(0)`.
    // Those are not measurements.
    expect(source).not.toMatch(/totalProjects:\s*1,/);
    expect(source).not.toMatch(/totalEcContribution:\s*BigInt\(0\)/);
    expect(source).toContain('totalProjects: null');
    expect(source).toContain('totalEcContribution: null');
    // …and the table prints the absence rather than a confident zero.
    expect(source).not.toMatch(/p\.coordinatorProjects \|\| 0/);
    expect(source).toContain("p.totalProjects ?? '—'");
  });

  test('a failed lookup raises a SystemAlert and is shown, not swallowed', () => {
    expect(source).toContain('recordAlert');
    expect(source).toContain('queryFailed');
  });
});

describe('M10 documents page — no demo document set', () => {
  const source = readCode(
    'src/app/[locale]/(app)/[workspace]/opportunities/[id]/documents/page.tsx'
  );

  test('carries none of the invented documents it used to render for any id', () => {
    for (const invented of [
      'MUTUAL NON-DISCLOSURE AGREEMENT',
      'LETTER OF INTENT',
      'TÜBİTAK EŞİK ÜSTÜ',
      '13.5 / 15.0',
      'FonBridge Teknoloji',
      'doc-nda-1',
      'storage.fabrika.app/docs/sample',
    ]) {
      expect(source).not.toContain(invented);
    }
  });

  test('an unknown or cross-tenant opportunity is a 404, and nothing swallows it', () => {
    expect(source).toContain('notFound()');
    // `notFound()` signals by throwing: a catch around the query would swallow
    // it and put the page straight back on a fallback.
    expect(source).not.toContain('catch');
  });
});

describe('notifications page — the invented feed is gone', () => {
  const source = readCode('src/app/[locale]/(app)/[workspace]/notifications/page.tsx');
  const client = readCode('src/app/[locale]/(app)/[workspace]/notifications/client.tsx');

  test('no longer builds four notifications in code', () => {
    for (const invented of [
      'Yeni Çağrı Eşleşmesi',
      '%92 oranında eşleşti',
      'New Call Match',
      'SME Declaration expires in 15 days',
      'Monthly 500 AI Credits added',
      'M4 interaction note added with Fraunhofer',
    ]) {
      expect(source).not.toContain(invented);
    }
    expect(source).toContain('initialNotifications={[]}');
  });

  test('the client has an empty state, so an empty feed reads as empty', () => {
    expect(client).toContain('notifications.length === 0');
  });
});

describe('app-shell notification bell — the same invented feed, on every page', () => {
  const source = readCode('src/components/UserMenu.tsx');

  test('the three hard-coded notifications are gone from the shell', () => {
    // Found from a screenshot: the notifications *page* was empty while the bell
    // in the header still pulsed with two unread items on every route.
    for (const invented of [
      'Yeni Çağrı Eşleşmesi',
      'HORIZON-CL5-2026-D3 %92 uyumlu',
      'SME Beyannamesi 15 gün içinde doluyor',
      'Aylık 500 AI Kredisi hesabınıza tanımlandı',
      'SME Declaration expires in 15 days',
      'Monthly 500 AI Credits added to account',
    ]) {
      expect(source).not.toContain(invented);
    }
  });

  test('the dropdown has an empty state', () => {
    expect(source).toContain('notificationsList.length === 0');
  });
});

describe('person-days report — reads Effort instead of a mock array', () => {
  const source = readCode('src/app/[locale]/(app)/[workspace]/reports/person-days/page.tsx');

  test('the MOCK_REPORTS constant and its dead link are gone', () => {
    for (const invented of [
      'MOCK_REPORTS',
      'Advanced AI solutions for climate modeling',
      'Smart grids optimization',
      'pipeline/mock_id',
    ]) {
      expect(source).not.toContain(invented);
    }
  });

  test('the page queries the real, tenant-scoped Effort table', () => {
    expect(source).toContain('tx.effort.findMany');
    expect(source).toContain('withTenant');
    expect(source).toContain('deletedAt: null');
  });
});

describe('application client — no fabricated consortium on mount', () => {
  const source = readCode(
    'src/app/[locale]/(app)/[workspace]/opportunities/[id]/application/client.tsx'
  );

  test('the budget and work-package state open empty, not pre-filled', () => {
    // Only the placeholder attribute may still name an example organisation;
    // no useState initialiser may.
    expect(source).not.toMatch(/useState\('Fraunhofer Institute'\)/);
    expect(source).not.toContain("partnerName: 'Fraunhofer Institute (DE)'");
    expect(source).not.toContain("partnerName: 'Demo SME Consultancy (TR)'");
    expect(source).not.toContain("leadPartner: 'Siemens AG'");
    expect(source).not.toContain('requestedTotal: 247500');
    expect(source).toContain('(partA?.content)?.budget || []');
    expect(source).toContain('(partB?.content)?.workPackages || []');
  });

  test('empty states replace the invented rows', () => {
    expect(source).toContain('budgetLines.length === 0');
    expect(source).toContain('workPackages.length === 0');
  });
});

/**
 * The one point on this card that can be executed rather than grepped: an LLM
 * failure used to produce a finished legal document and charge a credit for it.
 */
const { generateTextMock, withTenantMock, requireTenantActionMock, recordAlertMock } = vi.hoisted(
  () => ({
    generateTextMock: vi.fn(),
    withTenantMock: vi.fn(),
    requireTenantActionMock: vi.fn(),
    recordAlertMock: vi.fn(),
  })
);

vi.mock('@/lib/ai/llm', () => ({ generateText: generateTextMock }));
vi.mock('@/lib/db', () => ({ withTenant: withTenantMock, prisma: {} }));
vi.mock('@/lib/tenant', () => ({
  requireTenantAction: requireTenantActionMock,
  TenantScopeError: class TenantScopeError extends Error {},
}));
vi.mock('@/lib/observability/system-alert', () => ({ recordAlert: recordAlertMock }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

const { generateStandardDoc } = await import('@/modules/m10/server/actions');

/** Records every write the action attempts inside its transaction. */
function transactionSpy() {
  const created: Array<{ table: string; data: unknown }> = [];
  const tx = {
    opportunity: {
      findFirst: vi.fn().mockResolvedValue({ title: 'Zero-Emission Transport Systems' }),
    },
    followupDoc: {
      create: vi.fn(async ({ data }: { data: unknown }) => {
        created.push({ table: 'FollowupDoc', data });
        return { id: 'doc-1', ...(data as object) };
      }),
    },
    creditLedger: {
      create: vi.fn(async ({ data }: { data: unknown }) => {
        created.push({ table: 'CreditLedger', data });
        return { id: 'ledger-1' };
      }),
    },
  };
  return { tx, created };
}

describe('M8 consortium page — the demo opportunity map is gone', () => {
  const source = readCode(
    'src/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/page.tsx'
  );

  test('none of the four invented opportunities survives in code', () => {
    for (const invented of [
      'DEMO_OPPORTUNITIES',
      'FLEX-GRID',
      'TWIN-HYDRO',
      'CIRC-PACK',
      'CLEAN-PORT',
      'HORIZON-CL5-2024-D3-01-01',
    ]) {
      expect(source).not.toContain(invented);
    }
  });

  test('an unreadable query is reported, not answered with a page', () => {
    // The old catch was a bare `console.warn` that fell through to the demo map,
    // so a permanently broken query rendered as a working consortium builder.
    expect(source).toContain('recordAlert');
    expect(source).toContain('consortium_page_query_failed');
    expect(source).not.toMatch(/catch \(e\) \{\s*console\.warn/);
  });

  test('an opportunity this tenant does not own is a 404', () => {
    expect(source).toContain('notFound()');
    // notFound() throws; leaving it inside the try would swallow it back into
    // the catch. It must sit after the try block.
    const tryEnd = source.lastIndexOf('} catch');
    expect(source.indexOf('if (!opportunity) return notFound();')).toBeGreaterThan(tryEnd);
  });
});

describe('M10 generateStandardDoc — a failed generation is an error, not a document', () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    withTenantMock.mockReset();
    recordAlertMock.mockReset().mockResolvedValue({ status: 'recorded', id: 'alert-1' });
    requireTenantActionMock.mockReset().mockResolvedValue({
      tenantId: 'demo-tenant',
      userId: 'demo-user',
      role: 'PIPELINE_MANAGER',
      workspaceIds: [],
      isPlatformAdmin: false,
    });
  });

  test('writes no document and charges no credit when the LLM call throws', async () => {
    const { tx, created } = transactionSpy();
    withTenantMock.mockImplementation(async (_tenantId: string, cb: (t: unknown) => unknown) =>
      cb(tx)
    );
    generateTextMock.mockRejectedValue(new Error('upstream 503'));

    await expect(generateStandardDoc('opp-1', 'AWARD_PACK')).rejects.toThrow(
      /Document generation failed/
    );

    // The old catch substituted a TÜBİTAK award pack asserting "Komisyon ESR
    // Puanı: 13.5 / 15.0", stored it, and deducted one AI credit.
    expect(created).toEqual([]);
    expect(tx.followupDoc.create).not.toHaveBeenCalled();
    expect(tx.creditLedger.create).not.toHaveBeenCalled();
    expect(recordAlertMock).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'm10_document_generation_failed' })
    );
  });

  test('an empty completion is treated the same as a thrown one', async () => {
    const { tx, created } = transactionSpy();
    withTenantMock.mockImplementation(async (_tenantId: string, cb: (t: unknown) => unknown) =>
      cb(tx)
    );
    generateTextMock.mockResolvedValue('   ');

    await expect(generateStandardDoc('opp-1', 'NDA')).rejects.toThrow(/no content/);
    expect(created).toEqual([]);
  });

  test('a successful generation still writes the document and charges the credit', async () => {
    // The half a careless fix breaks: refusing to invent must not stop the
    // real path from working.
    const { tx, created } = transactionSpy();
    withTenantMock.mockImplementation(async (_tenantId: string, cb: (t: unknown) => unknown) =>
      cb(tx)
    );
    generateTextMock.mockResolvedValue('### NDA\n\nReal generated body.');

    const doc = await generateStandardDoc('opp-1', 'NDA');

    expect(doc.contentText).toContain('Real generated body.');
    expect(created.map((c) => c.table)).toEqual(['FollowupDoc', 'CreditLedger']);
  });

  test('the per-kind invented document bodies are gone from the source', () => {
    const source = readCode('src/modules/m10/server/actions.ts');
    // Only the comment explaining what was removed may mention these; no
    // template literal may produce one.
    expect(source).not.toContain('**Partner Name:** Fraunhofer Institute / SME Partner');
    expect(source).not.toContain('**5. Ödül Beyanı:**');
    expect(source).not.toContain('High excellence score (4.5)');
  });
});
