'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { PROVINCES } from '@/lib/expert-prereg/options';
import { focusRing, inputClass } from './styles';

interface ProvinceComboboxProps {
  id: string;
  value: string;
  onChange: (code: string) => void;
  invalid: boolean;
  describedBy?: string;
}

/** tr-TR folding, so "istanbul" finds "İstanbul" and "izmir" finds "İzmir". */
const fold = (s: string) => s.toLocaleLowerCase('tr-TR').trim();

/**
 * The 81 provinces as an ARIA 1.2 combobox: type to filter (by name or plate
 * code), arrow keys to move, Enter to pick, Escape to close. A native <select>
 * of 81 rows cannot be searched on a phone, which is the case this page is for.
 */
export default function ProvinceCombobox({ id, value, onChange, invalid, describedBy }: ProvinceComboboxProps) {
  const t = useTranslations('ExpertPrereg.form');
  const listId = useId();
  const statusId = useId();
  const selected = PROVINCES.find((p) => p.value === value);
  const [query, setQuery] = useState(selected?.name ?? '');
  const [open, setOpen] = useState(false);
  // -1 = no active option: Enter is left to the form until an arrow key moves.
  const [active, setActive] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    const q = fold(query);
    if (!q || (selected && fold(selected.name) === q)) return PROVINCES;
    // Names that start with the query first ("is" → İstanbul, then Afyonkarahisar).
    const starts = PROVINCES.filter((p) => fold(p.name).startsWith(q) || p.value.startsWith(q));
    return [...starts, ...PROVINCES.filter((p) => !starts.includes(p) && fold(p.name).includes(q))];
  }, [query, selected]);

  // Keep the active option in view, also when the list opens on a saved province.
  useEffect(() => {
    if (open && active >= 0) listRef.current?.children[active]?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active]);

  function choose(code: string) {
    const p = PROVINCES.find((x) => x.value === code);
    if (!p) return;
    onChange(p.value);
    setQuery(p.name);
    setOpen(false);
    setActive(-1);
  }

  /** Opening shows the saved province as active, or nothing (ARIA APG). */
  function openList() {
    if (open) return;
    setOpen(true);
    setActive(matches.findIndex((p) => p.value === value));
  }

  function move(next: number) {
    setActive(Math.max(0, Math.min(matches.length - 1, next)));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setActive(Math.max(0, matches.findIndex((p) => p.value === value)));
        } else move(active + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (open) move(active - 1);
        break;
      case 'Home':
        if (open) {
          e.preventDefault();
          move(0);
        }
        break;
      case 'End':
        if (open) {
          e.preventDefault();
          move(matches.length - 1);
        }
        break;
      case 'Enter': {
        const pick = matches[active];
        if (open && active >= 0 && pick) {
          e.preventDefault();
          choose(pick.value);
        }
        break;
      }
      case 'Escape':
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
        break;
    }
  }

  const activeOption = open && active >= 0 ? matches[active] : undefined;

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeOption ? `${listId}-${activeOption.value}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={[describedBy, statusId].filter(Boolean).join(' ')}
        autoComplete="off"
        placeholder={t('province_placeholder')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          // A typed query makes its first match active, so "izmir" + Enter picks İzmir.
          setActive(e.target.value.trim() ? 0 : -1);
          if (value) onChange('');
        }}
        onFocus={openList}
        onClick={openList}
        onBlur={() => {
          setOpen(false);
          // An exact name typed out counts as a choice; anything else is not one.
          const exact = PROVINCES.find((p) => fold(p.name) === fold(query));
          if (exact && exact.value !== value) choose(exact.value);
        }}
        onKeyDown={onKeyDown}
        className={`${inputClass} ${invalid ? 'border-bad' : 'border-border'}`}
      />
      <span id={statusId} className="sr-only" aria-live="polite">
        {open ? (matches.length ? t('province_results', { count: matches.length }) : t('province_no_match')) : ''}
      </span>
      <ul
        id={listId}
        ref={listRef}
        role="listbox"
        aria-label={t('province_label')}
        hidden={!open}
        className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-lg"
      >
        {matches.length === 0 ? (
          <li className="px-3 py-2 text-sm text-ink-2" role="presentation">
            {t('province_no_match')}
          </li>
        ) : (
          matches.map((p, i) => (
            <li
              key={p.value}
              id={`${listId}-${p.value}`}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: the input's blur would close the list first.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(p.value);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex min-h-11 cursor-pointer items-center justify-between px-3 text-sm text-ink ${
                i === active ? 'bg-accent-light' : ''
              } ${p.value === value ? 'font-semibold' : ''} ${focusRing}`}
            >
              <span>{p.name}</span>
              <span className="font-mono text-xs text-ink-2">{p.value}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
