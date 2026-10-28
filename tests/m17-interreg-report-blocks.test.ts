import { describe, expect, it } from 'vitest';

import { inlineTokens, parseReportSections } from '@/modules/m17/report-blocks';

// The shape FO-188's buildReportMarkdown writes (src/modules/m17/server/report.ts):
// notice quote, four `## ` sections, score line, table with an escaped pipe, nested
// finding/why/fix items, `### ` criterion headings and two multi-line quotes.
const REPORT = [
  '> İç ön değerlendirme — resmî puan değildir.',
  '',
  '## 📊 Özet',
  '',
  '**Eleme riski — program reddeder:**',
  '',
  '- 🔴 1.2 Katma değer: not 1, 2 altında',
  '',
  '**Tahmini: 62/100** (≈37/60) — iç ön değerlendirme',
  '',
  '| No. | Kriter | Not |',
  '|---|---|---:|',
  '| 1.1 | Program \\| hedef | 3/5 |',
  '| 1.2 | Katma değer | 1/5 |',
  '',
  '_Çağrı kılavuzunun kendi tablosu:_ yok',
  '',
  '## 🔴 Kritik',
  '',
  '- **Bulgu:** RCO87 yok',
  '  - **Neden sorun?:** zorunlu gösterge',
  '  - **Çözüm önerisi:** ekleyin',
  '- **Bulgu:** ikinci',
  '',
  '## 🟡 Geliştir',
  '',
  '### 1.1 Program hedefi — 3',
  '- Zayıf yön: belirsiz',
  '',
  '## ✍️ Yeniden yazım',
  '',
  '**Özgün metin** (s. 4)',
  '',
  '> satır bir',
  '> satır iki',
  '',
  '**Yeniden yazım (EN)**',
  '',
  '> revised',
].join('\n');

describe('parseReportSections (FO-189)', () => {
  const sections = parseReportSections(REPORT);

  it('reads the four sections in order and leaves the notice out', () => {
    expect(sections.map((s) => s.title)).toEqual(['📊 Özet', '🔴 Kritik', '🟡 Geliştir', '✍️ Yeniden yazım']);
    expect(JSON.stringify(sections)).not.toContain('resmî puan değildir');
  });

  it('reads the score table, keeping an escaped pipe inside its cell', () => {
    const table = sections[0]!.blocks.find((b) => b.type === 'table');
    expect(table).toEqual({
      type: 'table',
      header: ['No.', 'Kriter', 'Not'],
      rows: [
        ['1.1', 'Program | hedef', '3/5'],
        ['1.2', 'Katma değer', '1/5'],
      ],
    });
  });

  it('nests why/fix under their finding', () => {
    expect(sections[1]!.blocks).toEqual([
      {
        type: 'list',
        items: [
          { text: '**Bulgu:** RCO87 yok', children: ['**Neden sorun?:** zorunlu gösterge', '**Çözüm önerisi:** ekleyin'] },
          { text: '**Bulgu:** ikinci', children: [] },
        ],
      },
    ]);
  });

  it('keeps a criterion heading and its items', () => {
    expect(sections[2]!.blocks).toEqual([
      { type: 'heading', text: '1.1 Program hedefi — 3' },
      { type: 'list', items: [{ text: 'Zayıf yön: belirsiz', children: [] }] },
    ]);
  });

  it('joins consecutive quote lines and splits quotes a blank line apart', () => {
    const quotes = sections[3]!.blocks.filter((b) => b.type === 'quote');
    expect(quotes).toEqual([
      { type: 'quote', lines: ['satır bir', 'satır iki'] },
      { type: 'quote', lines: ['revised'] },
    ]);
  });

  it('never yields markup: a tag in the user text stays a string', () => {
    const [s] = parseReportSections('## A\n\n<img src=x onerror=alert(1)>\n- <script>x</script>');
    expect(s!.blocks).toEqual([
      { type: 'paragraph', text: '<img src=x onerror=alert(1)>' },
      { type: 'list', items: [{ text: '<script>x</script>', children: [] }] },
    ]);
  });

  it('answers no sections for an empty or section-less text', () => {
    expect(parseReportSections('')).toEqual([]);
    expect(parseReportSections('> only a notice')).toEqual([]);
  });
});

describe('inlineTokens (FO-189)', () => {
  it('splits bold runs and a leading italic', () => {
    expect(inlineTokens('_Not:_ a **b** c')).toEqual([
      { kind: 'em', text: 'Not:' },
      { kind: 'text', text: ' a ' },
      { kind: 'strong', text: 'b' },
      { kind: 'text', text: ' c' },
    ]);
  });

  it('leaves an unmatched marker and a mid-line underscore as text', () => {
    expect(inlineTokens('a **b and snake_case_key')).toEqual([{ kind: 'text', text: 'a **b and snake_case_key' }]);
  });
});
