'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useFormatter } from 'next-intl';
import { AlertTriangle } from 'lucide-react';

import { logEffort } from '../actions';
import { errorMessage } from '@/lib/errors';

/**
 * One row of the `Effort` table, already tenant-scoped and name-resolved on the server.
 *
 * `date` travels as an ISO string because a server component cannot hand a `Date` to a client
 * component without it being serialised anyway; the client formats it in the user's locale.
 */
export interface EffortEntry {
  id: string;
  /** ISO-8601, UTC — the column is a UTC timestamp (CLAUDE.md §10). */
  date: string;
  hours: number;
  note: string | null;
  /** Display name of the person who logged it, or `null` when the id resolves to nobody. */
  userName: string | null;
}

/** Hours in a person-day, for the PD conversion shown above the table. */
const HOURS_PER_PERSON_DAY = 8;

/**
 * The effort log for one opportunity.
 *
 * This component used to open with `const MOCK_EFFORTS = [...]` — two invented rows attributed
 * to "Alice" and "Bob" — and its form pushed new entries into `useState`. Nothing was ever read
 * from or written to the `Effort` table, so the person-days figure was arithmetic over fiction
 * and every entry logged disappeared on reload. The rows now come from the database via
 * `page.tsx`, and the form calls the `logEffort` server action.
 *
 * An opportunity with no effort logged renders the empty state. Zero rows is a real answer;
 * inventing two so the table looks populated is what this replaces.
 */
export function EffortTracker({
  opportunityId,
  efforts,
}: {
  opportunityId: string;
  efforts: EffortEntry[];
}) {
  const t = useTranslations('Pipeline.detail.effortTab');
  const format = useFormatter();
  const router = useRouter();

  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const totalHours = efforts.reduce((sum, e) => sum + e.hours, 0);
  const personDays = (totalHours / HOURS_PER_PERSON_DAY).toFixed(1);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedHours = Number(hours);
    if (!hours || Number.isNaN(parsedHours) || parsedHours <= 0) {
      setError(t('error.EFFORT_INVALID_INPUT'));
      return;
    }

    startTransition(async () => {
      try {
        const res = await logEffort({
          opportunityId,
          date,
          hours: parsedHours,
          note: note.trim() || undefined,
        });
        if (!res.success) {
          setError(t(`error.${res.error}`));
          return;
        }
        setHours('');
        setNote('');
        // The saved row is read back from the server rather than appended on the client, so the
        // table and the total always show what the database actually holds.
        router.refresh();
      } catch (err) {
        setError(errorMessage(err, t('error.EFFORT_SAVE_FAILED')));
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-accent/10 p-4 rounded-xl border border-accent/20 flex justify-between items-center">
        <div>
          <h3 className="text-accent-ink font-bold text-base md:text-lg">{t('totalTitle')}</h3>
          <p className="text-muted text-xs">{t('totalHint', { hours: HOURS_PER_PERSON_DAY })}</p>
        </div>
        <div className="text-right" data-testid="effort-total">
          <div className="text-2xl md:text-3xl font-bold text-accent-ink">
            {personDays} <span className="text-sm font-medium">{t('personDaysUnit')}</span>
          </div>
          <div className="text-xs text-muted">{t('totalHours', { hours: totalHours })}</div>
        </div>
      </div>

      <form
        onSubmit={handleAdd}
        className="bg-ground p-4 rounded-xl border border-border grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
      >
        <div className="md:col-span-3">
          <label htmlFor="effort-date" className="block text-xs font-semibold text-ink mb-1">
            {t('field.date')}
          </label>
          <input
            id="effort-date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full p-2 bg-surface border border-border rounded-lg text-xs text-ink"
          />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="effort-hours" className="block text-xs font-semibold text-ink mb-1">
            {t('field.hours')}
          </label>
          <input
            id="effort-hours"
            type="number"
            step="0.5"
            min="0.5"
            required
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            data-testid="effort-hours"
            className="w-full p-2 bg-surface border border-border rounded-lg text-xs text-ink"
            placeholder={t('field.hoursPlaceholder')}
          />
        </div>
        <div className="md:col-span-5">
          <label htmlFor="effort-note" className="block text-xs font-semibold text-ink mb-1">
            {t('field.note')}
          </label>
          <input
            id="effort-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            data-testid="effort-note"
            className="w-full p-2 bg-surface border border-border rounded-lg text-xs text-ink placeholder:text-muted"
            placeholder={t('field.notePlaceholder')}
          />
        </div>
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={isPending}
            data-testid="effort-submit"
            className="w-full bg-accent text-white font-semibold py-2 px-4 rounded-lg text-xs hover:opacity-90 disabled:opacity-50 transition shadow-2xs cursor-pointer"
          >
            {isPending ? t('saving') : t('submit')}
          </button>
        </div>
      </form>

      {error && (
        <div
          role="alert"
          data-testid="effort-error"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 flex items-start gap-2"
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {efforts.length === 0 ? (
        <div
          data-testid="effort-empty"
          className="border border-dashed border-border rounded-xl bg-surface px-4 py-8 text-center"
        >
          <p className="text-sm font-semibold text-ink">{t('empty.title')}</p>
          <p className="text-xs text-muted mt-1">{t('empty.hint')}</p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-x-auto bg-surface">
          <table className="w-full text-left text-xs" data-testid="effort-table">
            <thead className="bg-ground/60 border-b border-border text-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-semibold uppercase">{t('field.date')}</th>
                <th scope="col" className="px-4 py-2.5 font-semibold uppercase">{t('field.user')}</th>
                <th scope="col" className="px-4 py-2.5 font-semibold uppercase">{t('field.hours')}</th>
                <th scope="col" className="px-4 py-2.5 font-semibold uppercase">{t('field.note')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {efforts.map((e) => (
                <tr key={e.id} className="hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3 text-ink font-mono">
                    {format.dateTime(new Date(e.date), { dateStyle: 'medium', timeZone: 'UTC' })}
                  </td>
                  <td className="px-4 py-3 text-ink-2 font-medium">{e.userName ?? t('unknownUser')}</td>
                  <td className="px-4 py-3 font-semibold text-ink">{t('hoursValue', { hours: e.hours })}</td>
                  <td className="px-4 py-3 text-muted">{e.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
