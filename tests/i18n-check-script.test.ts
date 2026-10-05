/**
 * Regression tests for the i18n gate itself.
 *
 * The gate spent its whole life stuck on exit 1 (every template-literal `t()` call read as
 * a literal key) while next.config.ts turned that exit code into a warning — so nothing
 * ever verified either half. These tests run the real script against fixture catalogs and
 * assert the two properties that matter: it stays green on legitimate code, and it goes
 * red on a key that ships in one language only.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const SCRIPT = path.join(process.cwd(), 'scripts/i18n-check.ts')

let fixtureRoot: string

/** Builds a throwaway project (src/ + messages/) and runs the gate with it as cwd. */
function runGate(source: string, tr: unknown, en: unknown) {
  const dir = fs.mkdtempSync(path.join(fixtureRoot, 'case-'))
  fs.mkdirSync(path.join(dir, 'src'))
  fs.mkdirSync(path.join(dir, 'messages'))
  fs.writeFileSync(path.join(dir, 'src', 'page.tsx'), source)
  fs.writeFileSync(path.join(dir, 'messages', 'tr.json'), JSON.stringify(tr))
  fs.writeFileSync(path.join(dir, 'messages', 'en.json'), JSON.stringify(en))

  const result = spawnSync('tsx', [SCRIPT, '--json'], { cwd: dir, encoding: 'utf-8' })
  return {
    status: result.status,
    summary: JSON.parse(result.stdout).summary as Record<string, string[] | number>,
  }
}

beforeAll(() => {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-gate-'))
})
afterAll(() => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true })
})

describe('scripts/i18n-check.ts', () => {
  it('passes when both catalogs agree', () => {
    const { status, summary } = runGate(
      `const t = useTranslations('Ns');\nexport const A = () => <p>{t('hello')}</p>;`,
      { Ns: { hello: 'merhaba' } },
      { Ns: { hello: 'hello' } }
    )
    expect(summary.missingInTurkish).toEqual([])
    expect(summary.missingInEnglish).toEqual([])
    expect(status).toBe(0)
  })

  it('fails when a key ships in Turkish only (CLAUDE.md rule 8)', () => {
    const { status, summary } = runGate(
      `const t = useTranslations('Ns');\nexport const A = () => <p>{t('hello')}</p>;`,
      { Ns: { hello: 'merhaba', extra: 'fazladan' } },
      { Ns: { hello: 'hello' } }
    )
    expect(summary.onlyInTurkish).toEqual(['Ns.extra'])
    expect(status).toBe(1)
  })

  it('fails when a key used in code is missing from a catalog', () => {
    const { status, summary } = runGate(
      `const t = useTranslations('Ns');\nexport const A = () => <p>{t('hello')}{t('gone')}</p>;`,
      { Ns: { hello: 'merhaba' } },
      { Ns: { hello: 'hello' } }
    )
    expect(summary.missingInBoth).toEqual(['Ns.gone'])
    expect(status).toBe(1)
  })

  // The exact defect this rewrite was opened for: `t(`status.${x}`)` is not a literal key.
  it('does not treat a template-literal key as a missing literal key', () => {
    const { status, summary } = runGate(
      'const t = useTranslations(\'Ns\');\nexport const A = ({s}) => <p>{t(`status.${s}`)}</p>;',
      { Ns: { status: { draft: 'taslak' } } },
      { Ns: { status: { draft: 'draft' } } }
    )
    expect(summary.missingInBoth).toEqual([])
    expect(summary.totalDynamicPatterns).toBe(1)
    expect(status).toBe(0)
  })

  it('still fails a template-literal key whose whole group is missing in one language', () => {
    const { status, summary } = runGate(
      'const t = useTranslations(\'Ns\');\nexport const A = ({s}) => <p>{t(`status.${s}`)}</p>;',
      { Ns: { status: { draft: 'taslak' } } },
      { Ns: { other: 'x' } }
    )
    expect(summary.unmatchedPatternsEnglish).toEqual(['Ns.status.${s}'])
    expect(status).toBe(1)
  })

  it('resolves each variable against its own namespace', () => {
    const { status, summary } = runGate(
      `const t = useTranslations('A');\nconst tOther = useTranslations('B');\n` +
        `export const X = () => <p>{t('one')}{tOther('two')}</p>;`,
      { A: { one: '1' }, B: { two: '2' } },
      { A: { one: '1en' }, B: { two: '2en' } }
    )
    expect(summary.missingInBoth).toEqual([])
    expect(status).toBe(0)
  })

  it('re-reads the namespace when a later function rebinds the same variable', () => {
    const { status, summary } = runGate(
      `function first() {\n  const t = useTranslations('A');\n  return t('one');\n}\n` +
        `async function second() {\n  const t = await getTranslations({ locale, namespace: 'B' });\n  return t('two');\n}`,
      { A: { one: '1' }, B: { two: '2' } },
      { A: { one: '1en' }, B: { two: '2en' } }
    )
    expect(summary.missingInBoth).toEqual([])
    expect(status).toBe(0)
  })

  it('ignores t() written inside a comment', () => {
    const { status, summary } = runGate(
      `const t = useTranslations('Ns');\n// the extractor only sees literal t('...') arguments\n` +
        `/* also t('block.comment.key') */\nexport const A = () => <p>{t('hello')}</p>;`,
      { Ns: { hello: 'merhaba' } },
      { Ns: { hello: 'hello' } }
    )
    expect(summary.missingInBoth).toEqual([])
    expect(status).toBe(0)
  })
})
