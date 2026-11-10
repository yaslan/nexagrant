import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  WORKSPACE_ROUTE_CATALOG,
  WORKSPACE_ROUTE_ALIASES,
} from '../../src/lib/modules/route-catalog';
import { getAllManifests, validateRegistry } from '../../src/lib/modules/registry';
import { isComingSoon } from '../../src/lib/modules/state-machine';
import trMessages from '../../messages/tr.json';
import enMessages from '../../messages/en.json';

const REPO_ROOT = path.resolve(__dirname, '../..');
const WORKSPACE_DIR = path.join(REPO_ROOT, 'src/app/[locale]/(app)/[workspace]');

/** Every `page.tsx` under `[workspace]`, as a path relative to that directory. */
function realWorkspacePages(dir = WORKSPACE_DIR, prefix = ''): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      found.push(...realWorkspacePages(path.join(dir, entry.name), rel));
    } else if (entry.name === 'page.tsx') {
      found.push(prefix);
    }
  }
  return found;
}

describe('workspace route catalog', () => {
  const realPages = realWorkspacePages().sort();

  it('lists every page that exists on disk, as a canonical route or an alias', () => {
    const known = new Set<string>([
      ...WORKSPACE_ROUTE_CATALOG,
      ...Object.keys(WORKSPACE_ROUTE_ALIASES),
    ]);
    const missing = realPages.filter((p) => !known.has(p));
    expect(missing, 'pages on disk that the catalog does not record').toEqual([]);
  });

  it('does not claim pages that no longer exist', () => {
    const onDisk = new Set(realPages);
    const stale = [...WORKSPACE_ROUTE_CATALOG].filter((p) => !onDisk.has(p));
    expect(stale, 'catalog entries with no page.tsx behind them').toEqual([]);
  });

  // NG-110: `ayarlar` (a re-export of `settings`) was also listed as canonical: two names for one page.
  it('records the settings root under one canonical name, with the Turkish one as alias', () => {
    const canonical: string[] = [...WORKSPACE_ROUTE_CATALOG];
    expect(canonical.filter((p) => p === 'settings' || p === 'ayarlar')).toEqual(['settings']);
    expect(WORKSPACE_ROUTE_ALIASES['ayarlar']).toBe('settings');
  });

  it('resolves every alias to a canonical route', () => {
    const canonical = new Set<string>(WORKSPACE_ROUTE_CATALOG);
    for (const [alias, target] of Object.entries(WORKSPACE_ROUTE_ALIASES)) {
      expect(canonical.has(target), `${alias} → ${target}`).toBe(true);
    }
  });
});

describe('module registry', () => {
  it('satisfies its structural invariants', () => {
    expect(validateRegistry()).toEqual([]);
  });

  it('only declares nav labels that exist in both tr and en', () => {
    const tr = (trMessages as Record<string, Record<string, unknown>>).Navigation ?? {};
    const en = (enMessages as Record<string, Record<string, unknown>>).Navigation ?? {};
    const missing: string[] = [];

    for (const m of getAllManifests()) {
      for (const item of m.nav) {
        if (!(item.labelKey in tr)) missing.push(`${m.id}: Navigation.${item.labelKey} missing in tr.json`);
        if (!(item.labelKey in en)) missing.push(`${m.id}: Navigation.${item.labelKey} missing in en.json`);
      }
    }

    expect(missing).toEqual([]);
  });

  it('only declares tables that are real Prisma models', () => {
    const schema = fs.readFileSync(path.join(REPO_ROOT, 'prisma/schema.prisma'), 'utf-8');
    const models = new Set(
      [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1] as string)
    );

    const missing: string[] = [];
    for (const m of getAllManifests()) {
      for (const table of m.tables) {
        if (!models.has(table)) missing.push(`${m.id}: "${table}" is not a model in schema.prisma`);
      }
    }

    expect(missing).toEqual([]);
  });

  it('gives every nav entry a distinct sort order', () => {
    const orders = getAllManifests().flatMap((m) => m.nav.map((n) => n.order));
    expect(new Set(orders).size, `duplicate nav orders in ${JSON.stringify(orders)}`).toBe(orders.length);
  });

  it('only declares opportunity tab labels that exist in both tr and en', () => {
    type Modules = Record<string, unknown>;
    const tr = (trMessages.Pipeline.detail.modules ?? {}) as Modules;
    const en = (enMessages.Pipeline.detail.modules ?? {}) as Modules;
    const missing: string[] = [];

    for (const m of getAllManifests()) {
      for (const tab of m.opportunityTabs ?? []) {
        if (!(tab.labelKey in tr)) missing.push(`${m.id}: Pipeline.detail.modules.${tab.labelKey} missing in tr.json`);
        if (!(tab.labelKey in en)) missing.push(`${m.id}: Pipeline.detail.modules.${tab.labelKey} missing in en.json`);
      }
    }

    expect(missing).toEqual([]);
  });

  it('gives every opportunity tab a distinct sort order', () => {
    const orders = getAllManifests().flatMap((m) => (m.opportunityTabs ?? []).map((n) => n.order));
    expect(new Set(orders).size, `duplicate tab orders in ${JSON.stringify(orders)}`).toBe(orders.length);
  });

  // FO-164 (P0-4): a module a tenant can buy but cannot click into is an orphan page.
  it('gives every module that is not "Yakında" a sidebar entry or an opportunity tab', () => {
    const orphans = getAllManifests()
      .filter((m) => !isComingSoon(m.id))
      .filter((m) => m.nav.length === 0 && (m.opportunityTabs ?? []).length === 0)
      .map((m) => m.id);
    expect(orphans).toEqual([]);
  });
});
