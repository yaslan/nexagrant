import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * TASK-MVBIVTBC7F317 (FO-18) — a security override in pnpm-workspace.yaml
 * moves only the vulnerable line of its own major. An open selector such as
 * `'undici@<7.29.1': '7.29.1'` would also catch a later `undici@6` and move it
 * to 7.x without a word from `pnpm install`; the break would show at run time.
 *
 * Rule for every `<pkg>@<range>` key: the range has a `>=` lower bound in the
 * same major as the pinned version (same minor for 0.x, where a minor breaks),
 * and a `<` upper bound. Without the upper bound, `hono@>=4.0.0` would also
 * pull a later `hono@5` down to 4.x. Parent selectors (`a>b`) are not version
 * selectors and are skipped.
 */

const ROOT = resolve(import.meta.dirname, '..');

/**
 * Deliberate major jumps, by exact key: the advisory leaves the older line
 * without a patch of its own, so the only fix is the next major. Each row must
 * stay in the yaml with its pin and its GHSA in the comment above it; dropping
 * one would quietly leave that older line open.
 */
const CROSS_MAJOR = new Map([
  ['deepmerge-ts@<8.0.0', { pinned: '8.0.0', ghsa: 'GHSA-ggr8-5vv4-36mx' }],
  ['sharp@>=0.34.0 <0.35.0', { pinned: '0.35.5', ghsa: 'GHSA-f88m-g3jw-g9cj' }],
  ['hono@>=3.0.0 <4.0.0', { pinned: '4.13.7', ghsa: 'GHSA-m732-5p4w-x69g' }],
  ['proxy-addr@>=1.1.0 <2.0.0', { pinned: '2.0.8', ghsa: 'GHSA-jqcg-44mw-7w3h' }],
  ['brace-expansion@>=4.0.0 <5.0.0', { pinned: '5.0.12', ghsa: 'GHSA-q2hr-2g5m-vwhr' }],
  // TASK-MVF543TDDDMX1 (FO-96): older lines FO-18 left without a row.
  ['sharp@<0.34.0', { pinned: '0.35.5', ghsa: 'GHSA-f88m-g3jw-g9cj' }],
  ['undici@<6.0.0', { pinned: '6.28.1', ghsa: 'GHSA-vxpw-j846-p89q' }],
  ['hono@<3.0.0', { pinned: '4.13.7', ghsa: 'GHSA-m732-5p4w-x69g' }],
  ['@hono/node-server@<1.0.0', { pinned: '1.19.15', ghsa: 'GHSA-wc8c-qw6v-h7f6' }],
  ['@modelcontextprotocol/sdk@<1.0.0', { pinned: '1.31.0', ghsa: 'GHSA-w48q-cv73-mx4w' }],
  ['mysql2@<3.0.0', { pinned: '3.23.1', ghsa: 'GHSA-3f6p-5ww8-9rcr' }],
  ['fast-uri@<2.0.0', { pinned: '2.4.7', ghsa: 'GHSA-hrr3-gc8f-f4qj' }],
  ['ip-address@<10.0.0', { pinned: '10.7.1', ghsa: 'GHSA-h3mg-xc3c-68pw' }],
  ['postcss-selector-parser@<7.0.0', { pinned: '7.1.6', ghsa: 'GHSA-rj75-hqrm-r3gf' }],
]);

function unquote(value: string): string {
  return value.trim().replace(/^'(.*)'$/, '$1');
}

/** `key: value` pairs of the top-level `overrides:` block, comments out. */
function overridesOf(yaml: string): Array<[string, string]> {
  const lines = yaml.split('\n');
  const start = lines.findIndex((line) => line === 'overrides:');
  if (start < 0) return [];
  const out: Array<[string, string]> = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const entry = line.match(/^\s+('[^']+'|[^\s#:][^:]*):\s*(.+)$/);
    if (entry && !line.trim().startsWith('#')) out.push([unquote(entry[1] ?? ''), unquote(entry[2] ?? '')]);
  }
  return out;
}

/** `major` for >=1, `0.minor` for 0.x. */
function line(version: string): string {
  const [major, minor] = version.split('.');
  return major === '0' ? `0.${minor}` : (major ?? '');
}

function compare(a: string, b: string): number {
  const [x, y] = [a.split('.').map(Number), b.split('.').map(Number)];
  for (let i = 0; i < 3; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Keys whose `<` upper bound is missing or above the pinned version. Such a
 * row would also catch a release newer than the pin (a patched 6.29 under
 * `'undici@>=6.0.0 <6.30.0': '6.28.1'`) and move it back down. Applies to
 * cross-major rows too, which `openSelectors` skips.
 */
function upperAbovePin(yaml: string): string[] {
  const bad: string[] = [];
  for (const [key, pinned] of overridesOf(yaml)) {
    const at = key.lastIndexOf('@');
    if (at <= 0 || key.slice(0, at).includes('>')) continue;
    const upper = key.slice(at + 1).match(/<\s*(\d+\.\d+\.\d+)/)?.[1];
    if (!upper || compare(upper, pinned) > 0) bad.push(key);
  }
  return bad;
}

function openSelectors(yaml: string): string[] {
  const bad: string[] = [];
  for (const [key, pinned] of overridesOf(yaml)) {
    const at = key.lastIndexOf('@');
    if (at <= 0) continue;
    if (key.slice(0, at).includes('>') || CROSS_MAJOR.has(key)) continue;
    const range = key.slice(at + 1);
    const lower = range.match(/>=\s*(\d+\.\d+\.\d+)/)?.[1];
    const upper = /<\s*\d+\.\d+\.\d+/.test(range);
    if (!lower || !upper || line(lower) !== line(pinned)) bad.push(key);
  }
  return bad;
}

describe('pnpm overrides stay in their own major', () => {
  test('pnpm-workspace.yaml has no open or cross-major version selector', () => {
    const yaml = readFileSync(resolve(ROOT, 'pnpm-workspace.yaml'), 'utf8');
    expect(overridesOf(yaml).length).toBeGreaterThan(10);
    expect(openSelectors(yaml)).toEqual([]);
  });

  test('no row reaches above its own pin', () => {
    const yaml = readFileSync(resolve(ROOT, 'pnpm-workspace.yaml'), 'utf8');
    expect(upperAbovePin(yaml)).toEqual([]);
  });

  test('every cross-major exception is still in the yaml, pinned, with its GHSA', () => {
    const yaml = readFileSync(resolve(ROOT, 'pnpm-workspace.yaml'), 'utf8');
    const pins = new Map(overridesOf(yaml));
    for (const [key, { pinned, ghsa }] of CROSS_MAJOR) {
      expect(pins.get(key), key).toBe(pinned);
      expect(yaml, `${key}: ${ghsa}`).toContain(ghsa);
    }
  });

  test('flags an open lower bound, a wrong major and a 0.x minor jump', () => {
    const yaml = [
      'overrides:',
      "  'html-to-docx>image-size': '>=2.0.3'",
      "  'undici@<7.29.1': '7.29.1'",
      "  'fast-uri@>=2.0.0 <3.1.8': '3.1.8'",
      "  'sharp@>=0.34.0 <0.35.5': '0.35.5'",
      "  'hono@>=4.0.0 <4.13.7': '4.13.7'",
      "  'hono@>=4.0.0': '4.13.7'",
      "  'deepmerge-ts@<8.0.0': '8.0.0'",
      "  'proxy-addr@>=1.1.0 <2.0.0': '2.0.8'",
      "  'proxy-addr@<2.0.0': '2.0.8'",
      'importers:',
      "  'undici@<1.0.0': '1.0.0'",
    ].join('\n');
    expect(openSelectors(yaml)).toEqual([
      'undici@<7.29.1',
      'fast-uri@>=2.0.0 <3.1.8',
      'sharp@>=0.34.0 <0.35.5',
      'hono@>=4.0.0',
      'proxy-addr@<2.0.0',
    ]);
  });

  test('mutant M1: dropping the upper bound of hono 4.x is caught', () => {
    const yaml = readFileSync(resolve(ROOT, 'pnpm-workspace.yaml'), 'utf8');
    const mutant = yaml.replace("'hono@>=4.0.0 <4.13.7'", "'hono@>=4.0.0'");
    expect(mutant).not.toBe(yaml);
    expect(openSelectors(mutant)).toEqual(['hono@>=4.0.0']);
  });

  test('mutant M2: an upper bound above the pin is caught, cross-major rows included', () => {
    const yaml = readFileSync(resolve(ROOT, 'pnpm-workspace.yaml'), 'utf8');
    const mutant = yaml
      .replace("'undici@>=6.0.0 <6.28.1'", "'undici@>=6.0.0 <6.30.0'")
      .replace("'undici@<6.0.0'", "'undici@<7.0.0'")
      .replace("'mysql2@<3.0.0'", "'mysql2@>=1.0.0'");
    expect(mutant).not.toBe(yaml);
    expect(upperAbovePin(mutant)).toEqual(['undici@>=6.0.0 <6.30.0', 'undici@<7.0.0', 'mysql2@>=1.0.0']);
  });
});
