'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './Button';

interface ModalProps {
  open: boolean;
  /** Called however it closed: the button, Escape, or `open` going false. */
  onClose: () => void;
  title: string;
  closeLabel: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * A native modal <dialog>, as KvkkDialog and the editor's ToolDialog: showModal() gives the focus
 * trap, Escape, the inert background and the return of focus, so none of that is hand-rolled.
 */
export function Modal({ open, onClose, title, closeLabel, children, footer }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-xl border border-border bg-surface p-0 text-ink backdrop:bg-black/50"
    >
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <h2 id={titleId} className="font-heading text-lg font-semibold">
            {title}
          </h2>
          <Button variant="secondary" onClick={() => ref.current?.close()}>
            {closeLabel}
          </Button>
        </div>
        <div className="overflow-y-auto px-5 py-4 text-sm leading-relaxed">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </dialog>
  );
}
