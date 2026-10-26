'use client';

import { Component, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Keeps a Partner Search widget's render error inside the widget (FO-62 review
 * Ö1). The FO-61 answers are read defensively (`readListResponse`), but a shape
 * nobody foresaw must still cost the box, not the call detail or partner page
 * around it.
 */
export class PartnerSearchBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return this.props.fallback === undefined ? <BoundaryNotice /> : this.props.fallback;
  }
}

function BoundaryNotice() {
  const t = useTranslations('PartnerSignal');
  return (
    <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800" data-testid="ps-boundary">
      {t('list.error')}
    </p>
  );
}
