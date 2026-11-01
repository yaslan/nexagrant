import { describe, test, expect } from 'vitest';

import { authorByline } from '@/lib/blog-shared';

/**
 * FO-76 — the author byline is one line, "<Ünvan> <İsim>", with the ünvan
 * optional. Display only: the stored `authorName` / `authorRole` are unchanged.
 */

describe('authorByline', () => {
  test('puts the ünvan before the name', () => {
    expect(authorByline({ name: 'Mehmet Yılmaz', role: 'Dr.' })).toBe('Dr. Mehmet Yılmaz');
  });

  test('shows only the name when there is no ünvan', () => {
    expect(authorByline({ name: 'Mehmet Yılmaz', role: '' })).toBe('Mehmet Yılmaz');
  });

  test('shows only the ünvan when the name is blank', () => {
    expect(authorByline({ name: '   ', role: 'Uzman' })).toBe('Uzman');
  });

  test('trims surrounding whitespace and collapses doubled spaces inside a part', () => {
    expect(authorByline({ name: '  Ayşe   Demir  ', role: '  Prof.  Dr. ' })).toBe('Prof. Dr. Ayşe Demir');
  });

  test('is empty when there is no author', () => {
    expect(authorByline(undefined)).toBe('');
    expect(authorByline({ name: '', role: '' })).toBe('');
  });
});
