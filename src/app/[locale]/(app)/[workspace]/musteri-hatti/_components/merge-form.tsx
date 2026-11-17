'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { mergeLeadsAction } from '../actions';

/**
 * One duplicate pair: the user picks which organisation to keep, the other is merged into it.
 * The choice is explicit (radio + button); nothing merges on render or on a timer.
 */
export function MergePairForm({
  aId,
  aName,
  bId,
  bName,
}: {
  aId: string;
  aName: string;
  bId: string;
  bName: string;
}) {
  const t = useTranslations('m18.duplicates');
  const tErr = useTranslations('m18.errors');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [keepId, setKeepId] = useState(aId);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const groupName = useId();

  const onMerge = () => {
    const dropId = keepId === aId ? bId : aId;
    start(async () => {
      const result = await mergeLeadsAction({ keepId, dropId });
      if (result.ok) {
        setNotice({
          kind: 'ok',
          text: t('merged', {
            contacts: result.data!.moved.contacts,
            deals: result.data!.moved.deals,
          }),
        });
        router.refresh();
      } else {
        setNotice({ kind: 'err', text: tErr(result.code) });
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onMerge();
      }}
      className="space-y-3"
    >
      <fieldset className="space-y-2 text-sm">
        <legend className="font-medium">{t('keepLegend')}</legend>
        {[
          { id: aId, name: aName },
          { id: bId, name: bName },
        ].map((org) => (
          <label key={org.id} className="flex items-center gap-2">
            <input
              type="radio"
              name={groupName}
              value={org.id}
              checked={keepId === org.id}
              onChange={() => setKeepId(org.id)}
              disabled={pending}
            />
            {org.name}
          </label>
        ))}
      </fieldset>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {t('mergeButton')}
        </button>
        {notice ? (
          <p role={notice.kind === 'err' ? 'alert' : 'status'} className={notice.kind === 'err' ? 'text-sm text-red-700' : 'text-sm text-emerald-700'}>
            {notice.text}
          </p>
        ) : null}
      </div>
    </form>
  );
}
