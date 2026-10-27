import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';

import trMessages from '../../messages/tr.json';
import enMessages from '../../messages/en.json';
import { getModuleCounts, moduleRegistry } from '@/lib/modules/registry';
import { isComingSoon } from '@/lib/modules/state-machine';
import { formatModuleIds, planCardCopy } from '@/lib/billing/plan-copy';
import type { ModuleId } from '@/lib/modules/types';

/**
 * FO-171 / K-572973 — every module count the product shows comes from the
 * registry as "{active} aktif modül + {soon} yakında". The copy once said
 * "11 Özel Ar-Ge Modülü (M1-M11)" while 17 manifests were registered.
 */

const ROOT = path.resolve(__dirname, '../..');

describe('getModuleCounts', () => {
  const ids = Object.keys(moduleRegistry) as ModuleId[];
  const counts = getModuleCounts();

  it('counts every registered manifest', () => {
    expect(counts.total).toBe(ids.length);
    expect(counts.active + counts.soon).toBe(counts.total);
  });

  it('calls "soon" exactly the modules the state machine refuses as coming soon', () => {
    expect(counts.soon).toBe(ids.filter((id) => isComingSoon(id)).length);
  });
});

describe('module count copy', () => {
  const tr = createTranslator({ locale: 'tr', messages: trMessages });
  const en = createTranslator({ locale: 'en', messages: enMessages });

  it('shows live and coming-soon modules together', () => {
    expect(tr('moduleCount.summary', { active: 11, soon: 6 })).toBe('11 aktif modül + 6 yakında');
    expect(en('moduleCount.summary', { active: 11, soon: 6 })).toBe('11 live modules + 6 coming soon');
    expect(tr('moduleCount.badge', { active: 11, soon: 6 })).toBe('11 aktif + 6 yakında');
    expect(en('moduleCount.badge', { active: 11, soon: 6 })).toBe('11 live + 6 soon');
  });

  it('drops the "+ 0 coming soon" tail when nothing is coming soon', () => {
    expect(tr('moduleCount.summary', { active: 17, soon: 0 })).toBe('17 aktif modül');
    expect(en('moduleCount.summary', { active: 1, soon: 0 })).toBe('1 live module');
    expect(tr('landing.modulesTitle', { active: 17, soon: 0 })).toBe('AB Proje Yönetimi İçin 17 Aktif Modül');
    expect(en('landing.modulesTitle', { active: 17, soon: 0 })).toBe('17 Live Modules for EU Proposal Production');
  });

  it('renders the registry counts, not a number written into the message', () => {
    const counts = getModuleCounts();
    expect(tr('moduleCount.summary', counts)).toBe(
      `${counts.active} aktif modül${counts.soon ? ` + ${counts.soon} yakında` : ''}`
    );
  });
});

/**
 * Copy that hard-codes how many modules there are. Each goes stale the day a
 * module ships, so it fails here; the text takes `getModuleCounts()` (or, for
 * a plan card, the plan's grant) as ICU arguments instead.
 */
const HARD_CODED = {
  /**
   * A number in front of "modül"/"module"/"engine", up to two words between:
   * "11 Özel Ar-Ge Modülü", "11 Integrated Engines".
   */
  count: /\b\d+\s+(?:[\p{L}&-]+\s+){0,2}(?:modül\p{L}*|modules?|engines?)\b/giu,
  /**
   * The same count spelled out: "on bir modül", "eleven modules". Turkish
   * words before "modül", English before the plural only ("the two facts the
   * module checks" counts facts); "bir"/"one" alone mean "a".
   */
  spelledTr:
    /(?<!\p{L})(?:(?:on|yirmi)(?:\s*(?:bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz))?|iki|üç|dört|beş|altı|yedi|sekiz|dokuz)\s+(?:[\p{L}&-]+\s+){0,2}modül\p{L}*/giu,
  spelledEn:
    /\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+(?:[\p{L}&-]+\s+){0,2}(?:modules|engines)\b/giu,
  /** A module id range, "M1-M11" or "M1–M11": it states the first and last module. */
  range: /\bM\d+\s*[-–]\s*M\d+\b/gu,
} as const;

/**
 * Lines allowed to match, as `path:text` substrings, each with why it is not
 * a module count. Add an entry only with its reason next to it.
 */
const ALLOWED: readonly string[] = [
  // Project months (M1 = first month of a project) in the Gantt title, not module ids.
  'messages/tr.json:      "title": "Proje Gantt Şeması & İş Paketi Zaman Çizelgesi (M1 - M36)"',
  'messages/en.json:      "title": "Project Gantt Chart & Work Package Timeline (M1 - M36)"',
  // Project months of a sample deliverable row in a code comment.
  'src/app/[locale]/(app)/[workspace]/opportunities/[id]/application/client.tsx:  // Prototyping & Pilot Testing / Fraunhofer Institute / M7-M24',
  // A comment recording which modules an old bug showed as active; not shown to anyone.
  'src/app/[locale]/(app)/[workspace]/settings/modules/plan-view.ts: * additionally showed M1–M5 and M8',
  // "FO-41" is a ticket id ("predate FO-41 and name modules in full"), not a module count.
  'src/lib/billing/catalog.ts:  // The contract terms (ILKADIM-PILOT.md §6.2) predate FO-41 and name modules in',
];

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') yield* sourceFiles(full);
    } else if (/\.(tsx?|json)$/.test(entry.name)) {
      yield full;
    }
  }
}

function hardCodedHits(): string[] {
  const hits: string[] = [];
  for (const root of ['src', 'messages']) {
    for (const file of sourceFiles(path.join(ROOT, root))) {
      const rel = path.relative(ROOT, file);
      fs.readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (ALLOWED.some((allowed) => `${rel}:${line}`.includes(allowed))) return;
          for (const pattern of Object.values(HARD_CODED)) {
            for (const match of line.matchAll(pattern)) hits.push(`${rel}:${i + 1}: ${match[0]}`);
          }
        });
    }
  }
  return hits;
}

function matchesAny(text: string): boolean {
  return Object.values(HARD_CODED).some((pattern) => text.match(pattern) !== null);
}

describe('hard-coded module counts', () => {
  it('appear nowhere in src/ or messages/', () => {
    expect(hardCodedHits()).toEqual([]);
  });

  it('catches the copy this guard was written for', () => {
    for (const text of [
      '11 Özel Ar-Ge Modülü (M1-M11)',
      '11 Integrated R&D Modules',
      '14 Modül',
      '11 Integrated Engines',
      'Modüller: M1-M11',
      'Modules: M1–M11',
      'Manage modules (M1 - M14) →',
      'on bir modül',
      'onbir Ar-Ge modülü',
      'eleven modules',
      'Seventeen integrated engines',
    ]) {
      expect(matchesAny(text), text).toBe(true);
    }
  });

  it('leaves ordinary module wording alone', () => {
    for (const text of ['bir modül seçin', 'one module per plan', 'Modüller: {modules}', 'M8 modülü', 'Bu modül yakında']) {
      expect(matchesAny(text), text).toBe(false);
    }
  });

  it('keeps every allow-list entry pointing at a line that still exists', () => {
    const lines: string[] = [];
    for (const root of ['src', 'messages']) {
      for (const file of sourceFiles(path.join(ROOT, root))) {
        const rel = path.relative(ROOT, file);
        for (const line of fs.readFileSync(file, 'utf8').split('\n')) lines.push(`${rel}:${line}`);
      }
    }
    for (const allowed of ALLOWED) expect(lines.some((line) => line.includes(allowed)), allowed).toBe(true);
  });
});

describe('plan card module list', () => {
  it('collapses three or more consecutive ids into a range and lists the rest', () => {
    expect(formatModuleIds(['M2', 'M3', 'M5'])).toBe('M2, M3, M5');
    expect(formatModuleIds(['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M8'])).toBe(`M1${'-'}M6, M8`);
    expect(formatModuleIds(['M10', 'M9', 'M11', 'M1'])).toBe(`M1, M9${'-'}M11`);
    expect(formatModuleIds([])).toBe('');
  });

  it('names a limited grant on its own and never folds it into a range (FO-41)', () => {
    const limited = { ids: ['M1'], label: (id: string) => `${id} (limited)` };
    expect(formatModuleIds(['M1', 'M2', 'M3', 'M5'], limited)).toBe('M1 (limited), M2, M3, M5');
    expect(formatModuleIds(['M1', 'M2', 'M3', 'M4'], limited)).toBe(`M1 (limited), M2${'-'}M4`);
    expect(formatModuleIds(['M1', 'M4', 'M7'], limited)).toBe('M1 (limited), M4, M7');
  });

  it('renders the basic line with its limited M1 as the plan grants it (tr + en)', () => {
    for (const [locale, messages, word] of [
      ['tr', trMessages, 'sınırlı'],
      ['en', enMessages, 'limited'],
    ] as const) {
      const t = createTranslator({ locale, messages, namespace: 'billingPanels.settings' });
      const line = planCardCopy({ planId: 'basic' }, t as unknown as Parameters<typeof planCardCopy>[1], locale, {
        summary: 'desc',
        bullets: ['modules'],
      }).bullets[0]?.text;
      expect(line).toBe(`${locale === 'tr' ? 'Modüller' : 'Modules'}: M1 (${word}), M2, M3, M5`);
    }
  });

  it('renders the ultra line from the plan grant, not from the message', () => {
    const tr = createTranslator({ locale: 'tr', messages: trMessages });
    const en = createTranslator({ locale: 'en', messages: enMessages });
    expect(tr('billingPanels.settings.plans.ultra.modules', { modules: 'X' })).toBe('Modüller: X');
    expect(en('billingPanels.settings.plans.ultra.modules', { modules: 'X' })).toBe('Modules: X');
  });
});
