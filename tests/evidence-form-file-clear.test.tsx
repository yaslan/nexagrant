// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { EvidenceForm, firstFileOrNull } from '@/app/[locale]/(app)/[workspace]/evidence/EvidenceForm';

/**
 * TASK-MTVPOR2CMV1RT — the file picker's `change` handler used to read
 * `e.target.files[0]` behind nothing but `e.target.files &&`.
 *
 * A `FileList` is an object, so an EMPTY one is truthy: the guard passes and the
 * index read yields `undefined`. That `undefined` was then pushed into state
 * declared `useState<File | null>(null)`, so the component held a value its own
 * type says is impossible. Every reader in the file happens to use a truthiness
 * check today, which is why nothing crashes yet — but the contract is already
 * broken, and the next reader written as `file !== null` throws.
 *
 * An empty FileList reaches this handler for real: clearing a selection (what
 * Playwright's `setInputFiles([])` does, and what a picker that returns no file
 * does on the platforms that fire `change` rather than `cancel`) delivers
 * exactly `files.length === 0`.
 */
afterEach(cleanup);

/**
 * A stand-in FileList. jsdom ships the FileList interface but no `DataTransfer`
 * to build one with, so this reproduces the only two properties the code under
 * test touches: `length`, and an out-of-range index read that yields
 * `undefined` — which is precisely the platform behaviour being guarded here.
 */
function makeFileList(files: File[]): FileList {
  const list: Record<number, File> & { length: number; item(i: number): File | null } = {
    length: files.length,
    item: (i: number) => files[i] ?? null,
  };
  files.forEach((f, i) => {
    list[i] = f;
  });
  return list as unknown as FileList;
}

const emptyFileList = (): FileList => makeFileList([]);
const fileListWith = (file: File): FileList => makeFileList([file]);

describe('firstFileOrNull', () => {
  it('returns null — never undefined — for an empty FileList', () => {
    const result = firstFileOrNull(emptyFileList());
    // Object.is, not a loose falsy check: `undefined` is the regression and it
    // is falsy too, so `expect(result).toBeFalsy()` would not catch it.
    expect(Object.is(result, null)).toBe(true);
  });

  it('returns null for a null FileList', () => {
    expect(Object.is(firstFileOrNull(null), null)).toBe(true);
  });

  it('returns the first file when one is selected', () => {
    const f = new File(['x'], 'iso-9001.pdf', { type: 'application/pdf' });
    expect(firstFileOrNull(fileListWith(f))).toBe(f);
  });
});

describe('EvidenceForm file picker', () => {
  it('clears a previously chosen file when the picker comes back empty', () => {
    const onSave = vi.fn();
    const { container } = render(<EvidenceForm onSave={onSave} onCancel={() => {}} />);
    const input = container.querySelector('#file-upload') as HTMLInputElement;

    const f = new File(['x'], 'iso-9001.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: fileListWith(f) } });
    expect(screen.getByText('iso-9001.pdf')).toBeTruthy();

    fireEvent.change(input, { target: { files: emptyFileList() } });
    expect(screen.getByText('Click to select a file or drag and drop')).toBeTruthy();
  });
});
