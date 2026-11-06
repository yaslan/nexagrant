import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, XCircle, type LucideIcon } from 'lucide-react';

export type StatusTone = 'ok' | 'warn' | 'bad';

const BADGE_TONES: Record<StatusTone | 'neutral' | 'accent', string> = {
  neutral: 'border-border bg-ground text-ink-2',
  accent: 'border-accent-ink/30 bg-accent-light text-accent-ink',
  ok: 'border-ok-ink/30 bg-ok/15 text-ok-ink',
  warn: 'border-amber-ink/30 bg-amber/15 text-amber-ink',
  bad: 'border-bad-ink/30 bg-bad/15 text-bad-ink',
};

/** A short label or a count. */
export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof BADGE_TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${BADGE_TONES[tone]}`}>{children}</span>;
}

const STATUS: Record<StatusTone, { icon: LucideIcon; text: string }> = {
  ok: { icon: CheckCircle2, text: 'text-ok-ink' },
  warn: { icon: AlertTriangle, text: 'text-amber-ink' },
  bad: { icon: XCircle, text: 'text-bad-ink' },
};

/** The green / yellow / red language: icon and words together, so no state rests on colour alone. */
export function Status({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const { icon: Icon, text } = STATUS[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${text}`}>
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      {children}
    </span>
  );
}
