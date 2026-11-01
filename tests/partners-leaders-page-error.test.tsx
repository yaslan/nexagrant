import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

/**
 * TASK-MVBBPXU1ZW0F5 (FO-5, review finding 1) — when the coordinator query
 * throws, /partners/leaders?topic= told the user "no coordinators for this
 * prefix". A failed query now shows its own message, the empty-result text
 * stays for a query that really returned nothing, and the error detail stays
 * in the server log.
 */

const { coordinatorLeaders, findMany } = vi.hoisted(() => ({
  coordinatorLeaders: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) => <a href={href}>{children as never}</a>,
}));
vi.mock('@/lib/modules/guard', () => ({ moduleGate: async () => null }));
// FO-163: the session/M1/window gate has its own test; these pin the data path.
vi.mock('@/lib/cordis-api-auth', () => ({ authenticateCordisSession: async () => ({ authenticated: true }) }));
vi.mock('@/lib/db', () => ({ prisma: { cordisPartnerProfile: { findMany } } }));
vi.mock('@/lib/k2-cordis/coordinator-leaders', () => ({ coordinatorLeaders }));

async function render(topic?: string): Promise<string> {
  const { default: LeadersPage } = await import('@/app/[locale]/(app)/[workspace]/partners/leaders/page');
  const el = await LeadersPage({
    params: Promise.resolve({ locale: 'en', workspace: 'main' }),
    searchParams: Promise.resolve(topic === undefined ? {} : { topic }),
  });
  return renderToStaticMarkup(el as ReactElement);
}

beforeEach(() => {
  coordinatorLeaders.mockReset();
  findMany.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('/partners/leaders?topic= when the query fails', () => {
  it('shows the load-failed message, not "no results", and does not leak the error', async () => {
    coordinatorLeaders.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5432 secret-host'));
    const html = await render('HORIZON-CL5-');
    expect(html).toContain('loadFailed');
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('noTopicResults');
    expect(html).not.toContain('ECONNREFUSED');
    expect(html).not.toContain('secret-host');
  });

  it('an empty successful result still says "no results"', async () => {
    coordinatorLeaders.mockResolvedValue([]);
    const html = await render('HORIZON-CL5-');
    expect(html).toContain('noTopicResults');
    expect(html).not.toContain('loadFailed');
  });

  it('the global list failing also shows the message instead of an empty grid', async () => {
    findMany.mockRejectedValue(new Error('boom'));
    const html = await render();
    expect(html).toContain('loadFailed');
    expect(html).not.toContain('noTopicResults');
    expect(coordinatorLeaders).not.toHaveBeenCalled();
  });
});
