'use client';

import { useId, useState, useTransition } from 'react';
import { MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { TR_PROVINCES } from '@/lib/readiness/provinces';
import { useActionErrorText } from '@/lib/hooks/use-action-error-text';
import { updateTenantProvince } from './actions';

/** TASK-MULV3JXS1AW5X — the organisation's province, optional, editable later. */
export default function ProvinceSetting({
  applies,
  initialProvince,
  canEdit,
}: {
  applies: boolean;
  initialProvince: string | null;
  canEdit: boolean;
}) {
  const t = useTranslations('tenantProvince');
  const errorText = useActionErrorText();
  const [saved, setSaved] = useState(initialProvince ?? '');
  const [value, setValue] = useState(initialProvince ?? '');
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const selectId = useId();
  const hintId = useId();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const res = await updateTenantProvince(value);
      if (res.ok) {
        setSaved(res.province ?? '');
        setStatus({ kind: 'ok', text: t('saved') });
      } else {
        setStatus({ kind: 'error', text: errorText(res.error, () => t(`errors.${res.error}`)) });
      }
    });
  };

  return (
    <section
      aria-labelledby={`${selectId}-title`}
      data-testid="tenant-province-setting"
      className="bg-surface p-6 md:p-8 rounded-2xl border border-border shadow-xs space-y-3"
    >
      <h2 id={`${selectId}-title`} className="text-sm font-bold text-ink flex items-center gap-2">
        <MapPin className="w-4 h-4 text-accent" aria-hidden="true" />
        <span>{t('title')}</span>
      </h2>

      {!applies ? (
        <p className="text-xs text-muted">{t('notApplicable')}</p>
      ) : (
        <form onSubmit={save} className="space-y-3">
          <div>
            <label htmlFor={selectId} className="block text-xs font-bold text-ink mb-1.5">
              {t('label')}
            </label>
            <select
              id={selectId}
              name="province"
              data-testid="tenant-province-select"
              aria-describedby={hintId}
              value={value}
              disabled={!canEdit || pending}
              onChange={(e) => {
                setValue(e.target.value);
                setStatus(null);
              }}
              className="w-full sm:max-w-xs min-h-11 bg-ground border border-border px-3 rounded-xl text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-70"
            >
              <option value="">{t('none')}</option>
              {TR_PROVINCES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <p id={hintId} className="text-[11px] text-muted mt-1">
              {canEdit ? t('hint') : t('readOnly')}
            </p>
          </div>

          {canEdit && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                data-testid="tenant-province-save"
                disabled={pending || value === saved}
                className="min-h-11 bg-accent text-white font-semibold text-xs py-2.5 px-6 rounded-xl hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {pending ? t('saving') : t('save')}
              </button>
              <p
                role="status"
                data-testid="tenant-province-status"
                className={`text-xs font-semibold ${status?.kind === 'error' ? 'text-bad' : 'text-ok'}`}
              >
                {status?.text}
              </p>
            </div>
          )}
        </form>
      )}
    </section>
  );
}
