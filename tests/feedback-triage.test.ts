import { describe, it, expect } from 'vitest';
import {
  triageFeedback,
  normalise,
  mostSevere,
  PRIORITY_SLA_HOURS,
} from '@/lib/feedback/triage';

describe('feedback triage — impact baseline', () => {
  const cases = [
    { impact: 'BLOCKER', expected: 'P0' },
    { impact: 'MAJOR', expected: 'P1' },
    { impact: 'MINOR', expected: 'P2' },
    { impact: 'IDEA', expected: 'P3' },
  ] as const;

  for (const { impact, expected } of cases) {
    it(`maps a plain BUG with impact ${impact} to ${expected}`, () => {
      const verdict = triageFeedback({
        category: 'BUG',
        impact,
        title: 'Bir sorun var',
        body: 'Sayfada beklediğimi göremedim, tekrar denedim.',
      });
      expect(verdict.priority).toBe(expected);
      expect(verdict.reason).toBe(`impact:${impact}`);
    });
  }
});

describe('feedback triage — keyword escalation', () => {
  it('escalates a "minor" bug that mentions data loss to P0', () => {
    const verdict = triageFeedback({
      category: 'BUG',
      impact: 'MINOR',
      title: 'Kaydettiğim teklif yok',
      body: 'Dün girdiğim veri kaybı yaşandı, hepsi gitmiş.',
    });
    expect(verdict.priority).toBe('P0');
    expect(verdict.reason).toBe('keyword:data-loss');
  });

  it('escalates a cross-tenant sighting to P0 even from an "idea"', () => {
    const verdict = triageFeedback({
      category: 'DATA_QUALITY',
      impact: 'IDEA',
      title: 'Listede tanımadığım kurum',
      body: 'Sanırım another tenant verisi ekranıma düşüyor.',
    });
    expect(verdict.priority).toBe('P0');
    expect(verdict.reason).toBe('keyword:security');
  });

  it('escalates a login failure written in English', () => {
    const verdict = triageFeedback({
      category: 'BUG',
      impact: 'MINOR',
      title: 'Stuck at the door',
      body: "I can't log in since this morning.",
    });
    expect(verdict.priority).toBe('P0');
    expect(verdict.reason).toBe('keyword:auth-down');
  });

  it('records both signals when the reporter already said BLOCKER', () => {
    const verdict = triageFeedback({
      category: 'BUG',
      impact: 'BLOCKER',
      title: 'Beyaz ekran',
      body: 'Uygulama açılmıyor, beyaz ekran görüyorum.',
    });
    expect(verdict.priority).toBe('P0');
    expect(verdict.reason).toBe('impact:BLOCKER+keyword:total-outage');
  });

  it('lifts an IDEA-marked crash report to P2, not to P0', () => {
    const verdict = triageFeedback({
      category: 'BUG',
      impact: 'IDEA',
      title: 'Ufak not',
      body: 'Kaydet düğmesine basınca sayfa çöküyor ama sonra düzeliyor.',
    });
    expect(verdict.priority).toBe('P2');
    expect(verdict.reason).toBe('keyword:crash');
  });
});

describe('feedback triage — category ceiling', () => {
  it('never lets a feature request out of P3, whatever it says', () => {
    const verdict = triageFeedback({
      category: 'FEATURE_REQUEST',
      impact: 'BLOCKER',
      title: 'Toplu dışa aktarma olmadan çalışamıyorum',
      body: 'Hiçbir şey çalışmıyor demek istemiyorum ama bu özellik olmadan veri kaybı riski var.',
    });
    expect(verdict.priority).toBe('P3');
    expect(verdict.reason).toContain('capped:FEATURE_REQUEST');
  });

  it('caps a UX complaint at P2', () => {
    const verdict = triageFeedback({
      category: 'UX',
      impact: 'BLOCKER',
      title: 'Menüyü bulamıyorum',
      body: 'Ayarların nerede olduğunu bir türlü bulamıyorum, her seferinde arıyorum.',
    });
    expect(verdict.priority).toBe('P2');
    expect(verdict.reason).toBe('impact:BLOCKER>capped:UX');
  });

  it('caps a performance report at P1', () => {
    const verdict = triageFeedback({
      category: 'PERFORMANCE',
      impact: 'BLOCKER',
      title: 'Liste açılmıyor',
      body: 'Çağrı listesi otuz saniyeden uzun sürüyor, bekleyemiyorum.',
    });
    expect(verdict.priority).toBe('P1');
    expect(verdict.reason).toBe('impact:BLOCKER>capped:PERFORMANCE');
  });

  it('lets DATA_QUALITY reach P0 — no ceiling', () => {
    const verdict = triageFeedback({
      category: 'DATA_QUALITY',
      impact: 'BLOCKER',
      title: 'Bütçe rakamı yanlış',
      body: 'Ekrandaki toplam bütçe çağrının kendi sayfasındaki rakamla tutmuyor.',
    });
    expect(verdict.priority).toBe('P0');
  });
});

describe('feedback triage — helpers', () => {
  it('folds Turkish diacritics so one term list covers both spellings', () => {
    expect(normalise('Veri Kaybı Şüphesi')).toContain('veri kaybi');
    expect(normalise('GİRİŞ YAPAMIYORUM')).toContain('giris yapamiyorum');
  });

  it('mostSevere treats P0 as the most severe', () => {
    expect(mostSevere('P2', 'P0')).toBe('P0');
    expect(mostSevere('P3', 'P1')).toBe('P1');
    expect(mostSevere('P1', 'P1')).toBe('P1');
  });

  it('matches the budgets published to partners in docs/BETA_GUIDE.md § 5', () => {
    expect(PRIORITY_SLA_HOURS).toEqual({ P0: 2, P1: 24, P2: 48, P3: 168 });
  });

  it('keeps the budget ladder strictly increasing', () => {
    expect(PRIORITY_SLA_HOURS.P0).toBeLessThan(PRIORITY_SLA_HOURS.P1);
    expect(PRIORITY_SLA_HOURS.P1).toBeLessThan(PRIORITY_SLA_HOURS.P2);
    expect(PRIORITY_SLA_HOURS.P2).toBeLessThan(PRIORITY_SLA_HOURS.P3);
  });
});
