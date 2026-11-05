// @vitest-environment jsdom
import React from 'react';
import { Role } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';

vi.mock('next/navigation', () => ({
  usePathname: () => '/tr/main/kanitlar',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import SidebarNav from '@/components/SidebarNav';
import { ModuleProvider } from '@/lib/modules/hooks';
import { codeRolesForSpecRole } from '@/lib/roles/spec-role-mapping';
import { hiddenNavKeysFor } from '@/lib/roles/nav-permissions';
import type { ModuleId } from '@/lib/modules/types';

afterEach(cleanup);

const OPEN: ModuleId[] = ['M1', 'M2', 'M3', 'M4', 'M5', 'M7', 'M17'];

function menuFor(role: Role | null, active: ModuleId[] = OPEN): string[] {
  const { unmount } = render(
    <NextIntlClientProvider locale="tr" messages={trMessages} timeZone="Europe/Istanbul">
      <ModuleProvider activeModules={active}>
        <SidebarNav locale="tr" hiddenNavKeys={hiddenNavKeysFor(role)} />
      </ModuleProvider>
    </NextIntlClientProvider>,
  );
  const keys = screen
    .getAllByTestId(/^sidebar-nav-/)
    .map((el) => el.getAttribute('data-testid')!.replace('sidebar-nav-', ''));
  unmount();
  return keys;
}

const ALL_INTERNAL = [
  'pipeline', 'partners', 'partnerResources', 'conceptNotes', 'interregReview',
  'evidence', 'relationships', 'tto', 'approvals', 'apiKeys',
];

describe('role-based menu (NG-4): the answer of can(), one entry per permission', () => {
  it.each([
    ['ADMIN', Role.TENANT_OWNER],
    ['ADMIN', Role.TENANT_ADMIN],
    ['KOORDINATOR', Role.PIPELINE_MANAGER],
  ] as const)('%s (%s) keeps the dashboard and every module entry', (spec, role) => {
    expect(codeRolesForSpecRole(spec)).toContain(role);
    expect(menuFor(role)).toEqual(expect.arrayContaining(['dashboard', 'calls', ...ALL_INTERNAL, 'settings']));
  });

  it('ORTAK (GUEST_PARTNER) holds none of the permissions behind the entries', () => {
    expect(codeRolesForSpecRole('ORTAK')).toContain(Role.GUEST_PARTNER);
    expect(menuFor(Role.GUEST_PARTNER)).toEqual(['calls', 'settings']);
  });

  it.each([Role.WRITER, Role.MEMBER])('%s, outside the specification, loses only the dashboard', (role) => {
    const menu = menuFor(role);
    expect(menu).not.toContain('dashboard');
    expect(menu).toEqual(expect.arrayContaining(['calls', ...ALL_INTERNAL, 'settings']));
  });

  it('a role the table does not know is offered no role-gated entry', () => {
    expect(menuFor(null)).toEqual(['calls', 'settings']);
  });

  it('Uzman and Denetçi have no code role yet: nothing here stands in for them', () => {
    expect(codeRolesForSpecRole('UZMAN')).toEqual([]);
    expect(codeRolesForSpecRole('DENETCI')).toEqual([]);
  });

  it('a closed module stays out of the menu for a role that could otherwise see it', () => {
    const menu = menuFor(Role.TENANT_OWNER, ['M1', 'M3']);
    expect(menu).not.toContain('pipeline');
    expect(menu).not.toContain('tto');
    expect(menu).toContain('evidence');
  });

  it('a role without the permission does not see the locked feature entry either', () => {
    expect(menuFor(Role.GUEST_PARTNER, [])).toEqual(['calls', 'settings']);
  });
});
