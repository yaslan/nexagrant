/**
 * NG-250 — every NexaGrant feature is either bound to the product routes that use it, or
 * listed as unbound with the reason. A bound route really calls the gate with that feature,
 * and a route that sits behind a module has that module in NG_FEATURE_MODULE (review U5:
 * a module-backed feature missing from the map is gated by plan and role only, which skips
 * the module switch — CLAUDE.md rule 4).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NG_FEATURE_MODULE } from './authz';
import { NG_DATA_FILE_EXCEPTIONS, NG_KEY_ROUTES, NG_ROUTE_BINDINGS, NG_UNBOUND_FEATURES } from './bindings';
import { NG_FEATURE_KEYS } from './features';

const ROOT = path.resolve(__dirname, '../../../..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

/** Every route.ts under a directory, repo-relative. */
const routeFiles = (dir: string): string[] =>
  readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return routeFiles(rel);
    return e.name === 'route.ts' ? [rel] : [];
  });

/** The NG-272 literal every key route must pass: the feature and action in the table, verbatim. */
const keyCallLiteral = (k: { feature: string | null; action: string | null }) =>
  k.feature === null
    ? 'null'
    : `{ action: '${k.action}', feature: '${k.feature}' }`;

describe('NG feature → route bindings (NG-250)', () => {
  it('every feature is bound or unbound-with-reason, never both, never neither', () => {
    const bound = new Set(NG_ROUTE_BINDINGS.map((b) => b.feature));
    for (const key of NG_FEATURE_KEYS) {
      const unbound = Object.hasOwn(NG_UNBOUND_FEATURES, key);
      expect(bound.has(key) !== unbound, `${key}: bound=${bound.has(key)} unbound=${unbound}`).toBe(true);
    }
    for (const reason of Object.values(NG_UNBOUND_FEATURES)) expect(reason.length).toBeGreaterThan(10);
  });

  it.each(NG_ROUTE_BINDINGS.map((b) => [`${b.method} ${b.route} → ${b.feature}`, b] as const))(
    '%s calls the gate with that feature and action',
    (_name, b) => {
      expect(existsSync(path.join(ROOT, b.file)), b.file).toBe(true);
      const src = read(b.file);
      if (b.kind === 'page') {
        // A server component page: the gate renders the refusal (page-gate.tsx), it does not return a 403.
        expect(src).toContain('export default async function');
        expect(src).toMatch(new RegExp(`ngPageGate\\([^)]*'${b.action}',\\s*'${b.feature}'`));
      } else if (b.gateFile) {
        // NG-250 r7: the route hands off to its handler, which calls the gate after its own role
        // and module doors (so a refused role keeps the route's NG-64 body).
        expect(src).toContain(`export async function ${b.method}`);
        expect(src).toContain(`from '@/${b.gateFile.replace(/^src\//, '').replace(/\.ts$/, '')}'`);
        const handler = read(b.gateFile);
        expect(handler).toMatch(new RegExp(`ngGateResponseInTx\\([^)]*'${b.action}',\\s*'${b.feature}'`));
        // …and after the doors: the gate call sits below the module/role decision in the same helper.
        expect(handler.indexOf('ngGateResponseInTx(')).toBeGreaterThan(handler.indexOf('await accessOf(tx, caller)'));
      } else {
        expect(src).toContain(`export async function ${b.method}`);
        expect(src).toMatch(new RegExp(`ngGateResponse\\([^)]*'${b.action}',\\s*'${b.feature}'`));
      }
    }
  );

  /**
   * NG-272: a key route's gate is the literal its file passes to the key door, so it cannot be
   * dropped or changed without this table changing too. Every /api/v1 handler is listed.
   */
  it('NG-272: every /api/v1 route is in NG_KEY_ROUTES, and no listed route is missing', () => {
    const v1 = routeFiles('src/app/api/v1');
    expect(v1.length).toBeGreaterThan(0);
    const listed = new Set(NG_KEY_ROUTES.filter((k) => k.door === 'api').map((k) => k.file));
    expect(v1.filter((f) => !listed.has(f)), 'v1 route with no key gate entry').toEqual([]);
    for (const k of NG_KEY_ROUTES.filter((x) => x.door === 'api')) {
      expect(existsSync(path.join(ROOT, k.file)), k.file).toBe(true);
    }
  });

  it.each(NG_KEY_ROUTES.map((k) => [`${k.door} ${k.file}`, k] as const))(
    '%s passes its NG-272 gate literal to the key door',
    (_name, k) => {
      const src = read(k.file);
      const door = k.door === 'api' ? 'authenticateApiKey' : 'authenticateCordisRequest';
      const literal = keyCallLiteral(k);
      expect(src, `${door}(req, ${literal}) missing in ${k.file}`).toContain(`${door}(req, ${literal})`);
      if (k.feature === null) {
        expect(k.reason ?? '', `${k.file} has no feature and no reason`).toMatch(/\S.{19,}/);
      }
    }
  );

  it('NG-272: a key route that is bound to a feature is also in NG_KEY_ROUTES with the same feature', () => {
    for (const b of NG_ROUTE_BINDINGS.filter((x) => x.file.startsWith('src/app/api/cordis/'))) {
      const key = NG_KEY_ROUTES.find((k) => k.file === b.file);
      expect(key, `${b.file} has a session gate but no key gate`).toBeDefined();
      expect(key?.feature).toBe(b.feature);
    }
  });

  it('a route behind a module names that module in NG_FEATURE_MODULE (U5)', () => {
    for (const b of NG_ROUTE_BINDINGS) {
      expect(NG_FEATURE_MODULE[b.feature] ?? null, `${b.feature} @ ${b.route}`).toBe(b.module);
      if (b.module) {
        // The module check is real: the route or its declared guard names the module.
        const guard = read(b.moduleGuardFile ?? b.file);
        expect(guard, `${b.moduleGuardFile ?? b.file} does not gate ${b.module}`).toMatch(new RegExp(`'${b.module}'|\\b${b.module}\\b`));
      }
    }
  });

  it('every module in NG_FEATURE_MODULE stands behind at least one bound route', () => {
    for (const [feature, moduleId] of Object.entries(NG_FEATURE_MODULE)) {
      expect(NG_ROUTE_BINDINGS.some((b) => b.feature === feature && b.module === moduleId), feature).toBe(true);
    }
  });

  it('the review measurement: partner_search is no longer outside the map', () => {
    expect(NG_FEATURE_MODULE.partner_search).toBe('M1');
    expect(Object.keys(NG_FEATURE_MODULE).length).toBeGreaterThan(0);
  });

  /**
   * Review B1 (NG-250): the table listed six API routes and the test read only those, so the
   * partner directory page served the same CORDIS rows with no plan gate. Read the other way
   * round: every file under src/app that touches partner-search data is bound or excused.
   */
  it('reverse coverage: every src/app file reading partner-search data is bound or excused with a reason', () => {
    // Two ways in: a direct Prisma read of the partner tables, or an import of a module that
    // reads them for you. The import check is the one that does not depend on a helper's name
    // (review F1, NG-250: the v1 routes reading listAnnouncements / coordinatorLeaders read the data
    // through a helper and the name list missed them).
    const DATA = /\b(cordisPartnerProfile|cordisOrganization)\b/;
    const DATA_MODULES = ['@/modules/m1/server/partner-search/http', '@/lib/k2-cordis/coordinator-leaders', '@/modules/m8/server/matching'];
    const importsDataModule = (src: string) =>
      DATA_MODULES.some((m) => new RegExp(`from\\s+['"]${m.replace(/[/.@-]/g, '\\$&')}['"]`).test(src));
    const walk = (dir: string): string[] =>
      readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) return walk(rel);
        return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [rel] : [];
      });
    const readers = walk('src/app').filter((f) => {
      const src = read(f);
      return DATA.test(src) || importsDataModule(src);
    });
    expect(readers.length).toBeGreaterThan(0);
    // A key route with a feature is bound too (NG-272): its gate is the authenticateApiKey call.
    const bound = new Set([
      ...NG_ROUTE_BINDINGS.map((b) => b.file),
      ...NG_KEY_ROUTES.filter((k) => k.feature !== null).map((k) => k.file),
    ]);
    const unaccounted = readers.filter((f) => !bound.has(f) && !Object.hasOwn(NG_DATA_FILE_EXCEPTIONS, f));
    expect(unaccounted, 'partner-search data read with no NexaGrant gate and no reason').toEqual([]);
    // No stale entry: an excused file still exists and still reads the data, and is not also bound.
    for (const [file, reason] of Object.entries(NG_DATA_FILE_EXCEPTIONS)) {
      expect(readers, `${file} is excused but does not read partner-search data`).toContain(file);
      expect(bound.has(file), `${file} is both bound and excused`).toBe(false);
      expect(reason.length).toBeGreaterThan(20);
    }
  });

  it('B1: the partner pages and the two partner-search API routes are bound to partner_search', () => {
    const want = [
      ['page', 'src/app/[locale]/(app)/[workspace]/partners/page.tsx'],
      ['page', 'src/app/[locale]/(app)/[workspace]/partners/[pic]/page.tsx'],
      ['page', 'src/app/[locale]/(app)/[workspace]/partners/leaders/page.tsx'],
      ['route', 'src/app/api/organizations/[pic]/announcements/route.ts'],
      ['route', 'src/app/api/topics/[identifier]/partner-signal/route.ts'],
    ] as const;
    for (const [kind, file] of want) {
      expect(NG_ROUTE_BINDINGS.find((b) => b.file === file), file).toMatchObject({ kind, feature: 'partner_search', module: 'M1' });
    }
  });
});
