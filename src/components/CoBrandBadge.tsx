import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { ShellCoBrand } from '@/lib/agency/cobrand-store';

/**
 * FB KAMU B4 (TASK-MULRRNIHVZM1Z) — "<agency> iş birliğiyle", beside the
 * product's own logo, never instead of it. Rendered only when the shell was
 * handed an entry (a tenant linked to an agency that has set one).
 *
 * The logo sits on a white tile in both themes: an agency logo drawn for a
 * white page would vanish on the dark surface otherwise. The text uses the
 * shell's `text-ink-2` token (≥ 10:1 on `surface` in light and dark).
 *
 * `compact` (the mobile header) keeps the sentence for screen readers only.
 */
export default function CoBrandBadge({ cobrand, compact = false }: { cobrand: ShellCoBrand; compact?: boolean }) {
  const t = useTranslations('coBrand');
  const line = t('with', { agency: cobrand.name });
  return (
    <div className="flex min-w-0 items-center gap-2" data-testid="cobrand-badge">
      {cobrand.logoSrc ? (
        <span className="inline-flex h-9 shrink-0 items-center rounded-md border border-border bg-white px-1.5">
          <Image
            src={cobrand.logoSrc}
            alt={t('logoAlt', { agency: cobrand.name })}
            width={96}
            height={28}
            unoptimized
            className="h-7 w-auto max-w-24 object-contain"
            data-testid="cobrand-logo"
          />
        </span>
      ) : null}
      <span className={compact ? 'sr-only' : 'truncate text-sm font-medium text-ink-2'} data-testid="cobrand-text">
        {line}
      </span>
    </div>
  );
}
