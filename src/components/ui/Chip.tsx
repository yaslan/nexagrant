import type { ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import { focusRing } from '@/components/expert-prereg/styles';

interface ChipProps {
  children: ReactNode;
  selected?: boolean;
  /** Given, the chip is a toggle button; left out, it is plain text. */
  onClick?: () => void;
  onRemove?: () => void;
  /** Required with `onRemove`: the × has no text of its own. */
  removeLabel?: string;
}

/** Selection is also shown by the tick, so it does not rest on colour alone. */
export function Chip({ children, selected = false, onClick, onRemove, removeLabel }: ChipProps) {
  const tone = selected ? 'border-accent-ink bg-accent-light text-accent-ink' : 'border-border bg-surface text-ink-2';
  const content = (
    <>
      {selected && <Check aria-hidden="true" className="h-3.5 w-3.5" />}
      {children}
    </>
  );

  return (
    <span className={`inline-flex min-h-8 items-center gap-1 rounded-full border px-3 text-xs font-semibold ${tone}`}>
      {onClick ? (
        <button type="button" aria-pressed={selected} onClick={onClick} className={`inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-full ${focusRing}`}>
          {content}
        </button>
      ) : (
        content
      )}
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          className={`-mr-1 inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full hover:bg-surface-hover ${focusRing}`}
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}
