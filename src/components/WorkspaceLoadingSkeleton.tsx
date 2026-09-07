import React from 'react';

/**
 * The workspace shell's loading skeleton.
 *
 * It used to live in a single `loading.tsx` at `[locale]/(app)/[workspace]`,
 * which put a Suspense boundary above *every* workspace route. That boundary is
 * why `notFound()` under `(app)` answered HTTP 200 (TASK-MTRNO3LBZB2Q7):
 * with a `loading.tsx` above it Next flushes the shell — and the 200 status
 * line — before the page has decided whether the record exists, so the
 * `notFound()` that comes later can only swap the body, never the status.
 * Measured on an otherwise identical pair of probe routes: without `loading.tsx`
 * the page answered 404, with it 200.
 *
 * So a `loading.tsx` may only sit above segments whose existence is NOT decided
 * by a lookup. In practice: a section that has no dynamic (`[param]`) child.
 * Adding one above a `[id]`/`[pic]` segment silently turns its 404 back into a
 * 200 — do not do it; give the dynamic segment's own leaf a boundary instead,
 * only if that leaf cannot itself 404.
 */
export default function WorkspaceLoadingSkeleton() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="bg-slate-200/80 rounded-2xl h-36 w-full shadow-xs" />

      {/* Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-200/60 rounded-2xl h-48 w-full" />
        <div className="bg-slate-200/60 rounded-2xl h-48 w-full" />
        <div className="bg-slate-200/60 rounded-2xl h-48 w-full" />
      </div>

      {/* Table / List Skeleton */}
      <div className="bg-slate-200/70 rounded-2xl h-64 w-full" />
    </div>
  );
}
