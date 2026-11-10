'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

export interface DateRangeFilterProps {
  from: Date;
  to: Date;
  onChange: (range: { from: Date; to: Date }) => void;
}

/** `YYYY-MM-DD` in local time — `toISOString()` would shift the day for UTC+n. */
function toInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

type Preset = '7d' | '30d' | 'month' | 'year';

export function DateRangeFilter({ from, to, onChange }: DateRangeFilterProps) {
  const t = useTranslations('Dashboard');
  const locale = useLocale();
  const panelId = useId();
  const fromId = `${panelId}-from`;
  const toId = `${panelId}-to`;

  const [isOpen, setIsOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(toInputValue(from));
  const [draftTo, setDraftTo] = useState(toInputValue(to));
  const containerRef = useRef<HTMLDivElement>(null);

  // The applied range is server-driven, so the draft is re-seeded from it on
  // every open rather than mirrored in an effect.
  const togglePanel = () => {
    if (!isOpen) {
      setDraftFrom(toInputValue(from));
      setDraftTo(toInputValue(to));
    }
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    if (!isOpen) return;
    function onDocumentPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('mousedown', onDocumentPointerDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onDocumentPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [isOpen]);

  const presets: Array<{ value: Preset; label: string }> = [
    { value: '7d', label: t('presetLast7') },
    { value: '30d', label: t('presetLast30') },
    { value: 'month', label: t('presetThisMonth') },
    { value: 'year', label: t('presetThisYear') },
  ];

  const handlePreset = (preset: Preset) => {
    const today = startOfDay(new Date());
    let nextFrom: Date;

    switch (preset) {
      case '7d':
        nextFrom = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        nextFrom = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        nextFrom = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'year':
        nextFrom = new Date(today.getFullYear(), 0, 1);
        break;
    }

    setIsOpen(false);
    onChange({ from: nextFrom, to: today });
  };

  const handleApplyCustom = () => {
    const nextFrom = new Date(`${draftFrom}T00:00:00`);
    const nextTo = new Date(`${draftTo}T00:00:00`);
    if (Number.isNaN(nextFrom.getTime()) || Number.isNaN(nextTo.getTime())) return;
    if (nextFrom > nextTo) return;
    setIsOpen(false);
    onChange({ from: nextFrom, to: nextTo });
  };

  const formatDate = (date: Date) =>
    date.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={togglePanel}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={panelId}
        // WCAG 2.5.3: the name starts with the range the button shows, then says what it does.
        aria-label={`${formatDate(from)} — ${formatDate(to)}, ${t('dateFilterAria')}`}
        className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium text-sm flex items-center gap-2"
      >
        <span aria-hidden="true">📅</span>
        {formatDate(from)} — {formatDate(to)}
      </button>

      {isOpen && (
        <div
          id={panelId}
          role="dialog"
          aria-label={t('dateFilterAria')}
          className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10"
        >
          <div className="p-4 space-y-3">
            <div className="text-sm font-semibold text-gray-900 dark:text-white">
              {t('quickSelect')}
            </div>
            {presets.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handlePreset(option.value)}
                className="w-full text-left px-3 py-2 rounded text-sm transition-colors text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {option.label}
              </button>
            ))}

            <div className="pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
              <div className="text-sm font-semibold text-gray-900 dark:text-white">
                {t('customRange')}
              </div>
              <div>
                <label
                  htmlFor={fromId}
                  className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
                >
                  {t('fromLabel')}
                </label>
                <input
                  id={fromId}
                  name="from"
                  type="date"
                  value={draftFrom}
                  max={draftTo}
                  onChange={(e) => setDraftFrom(e.target.value)}
                  className="w-full px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label
                  htmlFor={toId}
                  className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
                >
                  {t('toLabel')}
                </label>
                <input
                  id={toId}
                  name="to"
                  type="date"
                  value={draftTo}
                  min={draftFrom}
                  onChange={(e) => setDraftTo(e.target.value)}
                  className="w-full px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                />
              </div>
              <button
                type="button"
                onClick={handleApplyCustom}
                className="w-full px-3 py-2 rounded text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                {t('applyLabel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
