import { useId, type InputHTMLAttributes } from 'react';
import { focusRing } from '@/components/expert-prereg/styles';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  /** Shown in place of the hint and announced with the field. */
  error?: string;
}

export function Input({ label, hint, error, id, className = '', ...props }: InputProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const message = error ?? hint;
  const messageId = `${fieldId}-message`;

  return (
    <div>
      <label htmlFor={fieldId} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      {/* The edge is --muted, not --border: a field's boundary needs 3:1 and --border is 1.23:1. */}
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={`mt-1 min-h-11 w-full rounded-lg border bg-surface px-3 text-sm text-ink placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-50 ${error ? 'border-bad-ink' : 'border-muted'} ${focusRing} ${className}`}
        {...props}
      />
      {message && (
        <p id={messageId} className={`mt-1 text-xs ${error ? 'text-bad-ink' : 'text-muted'}`}>
          {message}
        </p>
      )}
    </div>
  );
}
