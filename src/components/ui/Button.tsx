import type { ButtonHTMLAttributes } from 'react';
import { focusRing } from '@/components/expert-prereg/styles';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'md' | 'sm';

const VARIANTS: Record<ButtonVariant, string> = {
  // `bg-accent` under white text is 3.68:1 in the dark theme; the -strong steps are the AA fills.
  // Hover darkens rather than fades: opacity-90 takes white on --bad-strong below 4.5:1.
  primary: 'bg-accent-strong text-white hover:brightness-90',
  secondary: 'border border-border bg-surface text-ink hover:bg-surface-hover',
  danger: 'bg-bad-strong text-white hover:brightness-90',
  ghost: 'text-accent-ink hover:bg-accent-light',
};

const SIZES: Record<ButtonSize, string> = {
  md: 'min-h-11 px-4 text-sm',
  sm: 'min-h-9 px-3 text-xs',
};

/** The classes alone, for a link that has to look like a button. */
export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md'): string {
  return `inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${focusRing}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant, size, type = 'button', className = '', ...props }: ButtonProps) {
  return <button type={type} className={`${buttonClass(variant, size)} ${className}`} {...props} />;
}
