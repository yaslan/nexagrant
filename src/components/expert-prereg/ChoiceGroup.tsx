'use client';

import React, { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { focusRing, inputClass } from './styles';

interface ChoiceGroupProps {
  /** Field name; also the fieldset id the form focuses into on an error. */
  name: string;
  legend: string;
  hint?: string;
  required?: boolean;
  options: readonly { value: string; label: string }[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  error?: string;
  /** Show a filter box above the options (the 40+ expertise areas). */
  filterLabel?: string;
}

const fold = (s: string) => s.toLocaleLowerCase('tr-TR').trim();

/**
 * A multi-select as a fieldset of real checkboxes, laid out as chips: every
 * option is a 44px tap target, Tab/Space work as they do everywhere, and a
 * screen reader hears the legend, the hint and the error once per group.
 */
export default function ChoiceGroup({
  name,
  legend,
  hint,
  required,
  options,
  selected,
  onChange,
  error,
  filterLabel,
}: ChoiceGroupProps) {
  const t = useTranslations('ExpertPrereg.form');
  const [filter, setFilter] = useState('');
  const filterId = useId();
  const hintId = `${name}-hint`;
  const errorId = `${name}-error`;
  const q = fold(filter);
  // A ticked option stays visible while filtering, so a choice never disappears.
  const shown = q ? options.filter((o) => fold(o.label).includes(q) || selected.includes(o.value)) : options;

  function toggle(value: string, checked: boolean) {
    onChange(checked ? [...selected, value] : selected.filter((v) => v !== value));
  }

  return (
    <fieldset
      id={name}
      aria-describedby={[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined}
      aria-invalid={error ? true : undefined}
      className="min-w-0"
    >
      <legend className="text-sm font-medium text-ink">
        {legend}
        {required ? (
          <>
            <span className="text-bad" aria-hidden="true">
              {' *'}
            </span>
            <span className="sr-only"> {t('required_mark_sr')}</span>
          </>
        ) : null}
      </legend>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        {hint ? (
          <p id={hintId} className="text-xs text-ink-2">
            {hint}
          </p>
        ) : null}
        <p className="text-xs font-medium text-ink-2" aria-live="polite">
          {t('selected_count', { count: selected.length })}
        </p>
      </div>
      {filterLabel ? (
        <div className="mt-2">
          <label htmlFor={filterId} className="sr-only">
            {filterLabel}
          </label>
          <input
            id={filterId}
            type="search"
            placeholder={filterLabel}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className={`${inputClass} border-border`}
          />
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {shown.map((o) => {
          const id = `${name}-${o.value}`;
          const checked = selected.includes(o.value);
          return (
            <label
              key={o.value}
              htmlFor={id}
              className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                checked ? 'border-accent-strong bg-accent-light font-semibold text-ink' : 'border-border bg-surface text-ink'
              }`}
            >
              <input
                id={id}
                type="checkbox"
                name={name}
                value={o.value}
                checked={checked}
                onChange={(e) => toggle(o.value, e.target.checked)}
                className={`h-4 w-4 shrink-0 accent-[var(--accent-strong)] ${focusRing}`}
              />
              {o.label}
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={errorId} className="mt-1 text-sm font-medium text-bad">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
