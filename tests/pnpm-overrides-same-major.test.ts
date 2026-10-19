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
 * same major as the pinned version (same minor for 0.x, where a minor breaks).
 * Parent selectors (`a>b`) are not version selectors and are skipped.
 */

const ROOT = resolve(import.meta.dirname, '..');

/** Deliberate major jumps; each needs its reason next to the line in the yaml. */
const CROSS_MAJOR = new Set(['deepmerge-ts']);

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

function openSelectors(yaml: string): string[] {
  const bad: string[] = [];
  for (const [key, pinned] of overridesOf(yaml)) {
    const at = key.lastIndexOf('@');
    if (at <= 0) continue;
    const pkg = key.slice(0, at);
    if (pkg.includes('>') || CROSS_MAJOR.has(pkg)) continue;
    const lower = key.slice(at + 1).match(/>=\s*(\d+\.\d+\.\d+)/)?.[1];
    if (!lower || line(lower) !== line(pinned)) bad.push(key);
  }
  return bad;
}

describe('pnpm overrides stay in their own major', () => {
  test('pnpm-workspace.yaml has no open or cross-major version selector', () => {
    const yaml = readFileSync(resolve(ROOT, 'pnpm-workspace.yaml'), 'utf8');
    expect(overridesOf(yaml).length).toBeGreaterThan(10);
    expect(openSelectors(yaml)).toEqual([]);
  });

  test('flags an open lower bound, a wrong major and a 0.x minor jump', () => {
    const yaml = [
      'overrides:',
      "  'html-to-docx>image-size': '>=2.0.3'",
      "  'undici@<7.29.1': '7.29.1'",
      "  'fast-uri@>=2.0.0 <3.1.8': '3.1.8'",
      "  'sharp@>=0.34.0 <0.35.5': '0.35.5'",
      "  'hono@>=4.0.0 <4.13.7': '4.13.7'",
      "  'deepmerge-ts@<8.0.0': '8.0.0'",
      'importers:',
      "  'undici@<1.0.0': '1.0.0'",
    ].join('\n');
    expect(openSelectors(yaml)).toEqual(['undici@<7.29.1', 'fast-uri@>=2.0.0 <3.1.8', 'sharp@>=0.34.0 <0.35.5']);
  });
});
