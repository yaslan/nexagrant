import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  label: string;
  previousLabel: string;
  nextLabel: string;
}

/**
 * Previous / page / next, as on the calls list. The ends use aria-disabled rather than `disabled`:
 * a disabled button drops keyboard focus to the top of the page the moment the last page is reached.
 */
export function Pagination({ page, totalPages, onPageChange, label, previousLabel, nextLabel }: PaginationProps) {
  const atStart = page <= 1;
  const atEnd = page >= totalPages;

  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" aria-disabled={atStart} onClick={atStart ? undefined : () => onPageChange(page - 1)}>
        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
        {previousLabel}
      </Button>
      <span aria-live="polite" className="text-sm font-semibold text-ink">
        {page} / {totalPages}
      </span>
      <Button variant="secondary" aria-disabled={atEnd} onClick={atEnd ? undefined : () => onPageChange(page + 1)}>
        {nextLabel}
        <ChevronRight aria-hidden="true" className="h-4 w-4" />
      </Button>
    </nav>
  );
}
