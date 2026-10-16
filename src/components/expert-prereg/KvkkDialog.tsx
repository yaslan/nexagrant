'use client';

import React, { forwardRef, useId } from 'react';
import { useTranslations } from 'next-intl';
import type { KvkkBlock } from './kvkk-text';
import { focusRing } from './styles';

interface KvkkDialogProps {
  blocks: KvkkBlock[];
}

/**
 * The KVKK notice in a native modal <dialog>: showModal() gives the focus trap,
 * Escape-to-close and the inert background, so none of that is hand-rolled.
 * Rendered outside the consent <label> on purpose — a click on text inside a
 * label would tick the box.
 */
const KvkkDialog = forwardRef<HTMLDialogElement, KvkkDialogProps>(function KvkkDialog({ blocks }, ref) {
  const t = useTranslations('ExpertPrereg.kvkk');
  const titleId = useId();
  const title = blocks.find((b) => b.kind === 'title');

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-xl border border-border bg-surface p-0 text-ink backdrop:bg-black/50"
    >
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <h2 id={titleId} className="font-heading text-lg font-semibold">
            {title && title.kind === 'title' ? title.text : t('dialog_label')}
          </h2>
          <form method="dialog">
            <button
              type="submit"
              className={`inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-semibold text-ink hover:bg-surface-hover ${focusRing}`}
            >
              {t('close')}
            </button>
          </form>
        </div>
        <div className="space-y-3 overflow-y-auto px-5 py-4 text-sm leading-relaxed text-ink">
          {blocks.map((b, i) => {
            switch (b.kind) {
              case 'title':
                return null;
              case 'heading':
                return (
                  <h3 key={i} className="pt-2 font-semibold">
                    {b.text}
                  </h3>
                );
              case 'list':
                return (
                  <ul key={i} className="list-disc space-y-1 pl-5">
                    {b.items.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                );
              default:
                return <p key={i}>{b.text}</p>;
            }
          })}
        </div>
      </div>
    </dialog>
  );
});

export default KvkkDialog;
