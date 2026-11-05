import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { focusRing } from '@/components/expert-prereg/styles';

interface TableProps {
  /** Names the table and its scroll region for assistive technology. */
  caption: string;
  children: ReactNode;
}

/** A wide table scrolls inside its own frame, which keyboard users can focus, not across the page. */
export function Table({ caption, children }: TableProps) {
  return (
    <div role="region" aria-label={caption} tabIndex={0} className={`overflow-x-auto rounded-lg border border-border ${focusRing}`}>
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function Th({ className = '', scope = 'col', ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope={scope} className={`border-b border-border bg-ground px-3 py-2 text-xs font-semibold text-ink-2 ${className}`} {...props} />;
}

export function Td({ className = '', ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={`border-b border-border px-3 py-2 text-ink ${className}`} {...props} />;
}
