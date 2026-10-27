import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';

import trMessages from '../../messages/tr.json';
import enMessages from '../../messages/en.json';
import { getModuleCounts, moduleRegistry } from '@/lib/modules/registry';
import { isComingSoon } from '@/lib/modules/state-machine';
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
 * A number in front of "modül"/"module"/"engine" (up to two words between,
 * "11 Özel Ar-Ge Modülü", "11 Integrated Engines") is a count somebody typed
 * in. It goes stale the day a module ships, so it fails here; the text takes
 * `getModuleCounts()` as ICU arguments instead.
 */
const HARD_CODED_COUNT = /\b\d+\s+(?:[\p{L}&-]+\s+){0,2}(?:modül\p{L}*|modules?|engines?)\b/giu;

/**
 * Lines allowed to match, as `path:text` substrings. Empty today: add an entry
 * only for a number that is not a module count, with the reason next to it.
 */
const ALLOWED: readonly string[] = [];

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

describe('hard-coded module counts', () => {
  it('appear nowhere in src/ or messages/', () => {
    const hits: string[] = [];
    for (const root of ['src', 'messages']) {
      for (const file of sourceFiles(path.join(ROOT, root))) {
        const rel = path.relative(ROOT, file);
        fs.readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            for (const match of line.matchAll(HARD_CODED_COUNT)) {
              const hit = `${rel}:${i + 1}: ${match[0]}`;
              if (!ALLOWED.some((allowed) => `${rel}:${line}`.includes(allowed))) hits.push(hit);
            }
          });
      }
    }
    expect(hits).toEqual([]);
  });

  it('catches the copy this guard was written for', () => {
    for (const text of ['11 Özel Ar-Ge Modülü (M1-M11)', '11 Integrated R&D Modules', '14 Modül', '11 Integrated Engines']) {
      expect(text.match(HARD_CODED_COUNT), text).not.toBeNull();
    }
  });
});
