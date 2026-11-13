import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { planAgencyWrites, type AgencyRunSummary } from '../tr-agency-calls';

const FX = path.join(__dirname, 'fixtures', 'tr-agency');
const load = (name: string): AgencyRunSummary =>
  JSON.parse(readFileSync(path.join(FX, name), 'utf-8')) as AgencyRunSummary;

describe('planAgencyWrites (NG-148)', () => {
  it('İSTKA: bir çağrı, ham kayıt tek kaynak anahtarıyla planlanır', () => {
    const plan = planAgencyWrites(load('run-istka.json'));
    expect(plan.callUpserts).toHaveLength(1);
    expect(plan.callUpserts[0]?.callIdentifier).toMatch(/^ISTKA:İSTKA\/2026\//);
    expect(plan.rawFetch?.source).toBe('tr-agency:istka');
    expect(plan.rawFetch?.key).toBe('https://istka.org.tr/acik-destek-programlari');
    expect(plan.rawFetch?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(plan.alerts).toHaveLength(0);
  });

  it('UA: her çağrı benzersiz callIdentifier ile upsert edilir', () => {
    const plan = planAgencyWrites(load('run-ua.json'));
    const ids = plan.callUpserts.map((c) => c.callIdentifier);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('UA:'))).toBe(true);
  });

  it('bozuk sayfa: çağrı yazılmaz, AGENCY_SCHEMA_CHANGED uyarısı üretilir (koşu kırılmaz)', () => {
    const plan = planAgencyWrites(load('run-istka-broken.json'));
    expect(plan.callUpserts).toHaveLength(0);
    expect(plan.alerts).toHaveLength(1);
    expect(plan.alerts[0]?.level).toBe('warn');
    expect(plan.alerts[0]?.dedupeKey).toBe('agency:schema-changed:istka');
    expect(plan.alerts[0]?.meta).toMatchObject({ kind: 'AGENCY_SCHEMA_CHANGED', source: 'istka' });
  });

  it('kaynak çekilemedi: hata uyarısı, ham kayıt yok', () => {
    const plan = planAgencyWrites({
      source: 'ua',
      fetchError: 'ua: HTTP 503',
      rows: 0,
      calls: [],
      systemAlert: null,
    });
    expect(plan.rawFetch).toBeNull();
    expect(plan.alerts).toEqual([
      expect.objectContaining({ level: 'error', dedupeKey: 'agency:fetch-failed:ua' }),
    ]);
  });

  it('idempotent: aynı girdi aynı planı üretir', () => {
    const run = load('run-ua.json');
    expect(planAgencyWrites(run)).toEqual(planAgencyWrites(run));
  });

  it('aynı callIdentifier iki kez gelirse tek upsert, son kayıt kazanır', () => {
    const run = load('run-istka.json');
    const dup = { ...run, calls: [...run.calls, { ...run.calls[0]!, title: 'SON' }] };
    const plan = planAgencyWrites(dup);
    expect(plan.callUpserts).toHaveLength(1);
    expect(plan.callUpserts[0]?.title).toBe('SON');
  });
});
