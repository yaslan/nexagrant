import { describe, test, expect } from 'vitest';

import { countReadableWords, estimateReadMinutes, WORDS_PER_MINUTE } from '@/lib/blog-read-time';

/** TASK-MVDPA19QP3M9A — the read time a new post starts with comes from its content. */
const words = (n: number) => Array.from({ length: n }, (_, i) => `kelime${i}`).join(' ');

describe('estimateReadMinutes', () => {
  test('empty or blank content has no read time', () => {
    expect(estimateReadMinutes('')).toBe(0);
    expect(estimateReadMinutes('  \n\n ')).toBe(0);
    // Markers alone are not something to read.
    expect(estimateReadMinutes('# \n\n- \n\n**')).toBe(0);
  });

  test('a short post is never under one minute', () => {
    expect(estimateReadMinutes('Kısa bir not.')).toBe(1);
  });

  test('a long post is words / 200, rounded', () => {
    expect(estimateReadMinutes(words(WORDS_PER_MINUTE * 7))).toBe(7);
    expect(estimateReadMinutes(words(1049))).toBe(5);
    expect(estimateReadMinutes(words(1051))).toBe(5);
    expect(estimateReadMinutes(words(1100))).toBe(6);
  });
});

describe('countReadableWords — Markdown syntax is not counted', () => {
  test('headings, emphasis, list and quote markers drop out', () => {
    const md = [
      '# Başlık burada',
      '',
      '**Kalın** ve _eğik_ metin.',
      '',
      '- birinci madde',
      '* ikinci',
      '1. numaralı madde',
      '2) diğeri',
      '> alıntı',
      '`kod`',
    ].join('\n');
    // Başlık burada (2) · Kalın ve eğik metin. (4) · birinci madde (2) · ikinci · numaralı madde (2)
    // · diğeri · alıntı · kod = 14
    expect(countReadableWords(md)).toBe(14);
  });

  test('a link counts its text, not its address; an image counts its alt text', () => {
    expect(countReadableWords('[Horizon Avrupa çağrısı](https://example.org/a/b?c=d)')).toBe(3);
    expect(countReadableWords('![kapak](https://cdn.example.org/x.jpg)')).toBe(1);
  });

  test('HTML tags are not words', () => {
    expect(countReadableWords('<p>iki kelime</p><br/>')).toBe(2);
  });

  test('numbers in the text are still words', () => {
    expect(countReadableWords('Bütçe 2027 yılında 3 milyon')).toBe(5);
  });
});
