'use client';

import React, { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { updateRelationship, addInteraction } from '../actions';
import { useActionErrorText } from '@/lib/hooks/use-action-error-text';
import type { WorkspaceMember } from '@/lib/k5-pipeline/pipelineStore';
import type { InteractionRow, RelationshipRow } from '@/types/db-rows';

/**
 * The row shapes come from `@/types/db-rows`, which is kept against
 * prisma/schema.prisma. The hand-written local types they replace claimed
 * `Relationship.status`, `.remindAt`, `.createdAt` and `Interaction.createdAt`
 * — none of which exist as columns — and typed `Interaction.summary` as
 * non-null when the column is `String?`. Nothing here read those fields, so
 * they rendered nothing; they were a standing invitation to add a `rel.status`
 * badge that would always be `undefined`.
 *
 * The focal-point picker (TASK-MTTOUDNQ97X83, F-2) is the screen's newest
 * field. `Relationship.ownerUserId` became nullable so the erasure job could
 * detach a deleted person from a relationship the tenant keeps — but nothing
 * could then assign a new one, so a relationship went unassigned permanently
 * and its overdue `nextStep` reached nobody. `members` is the tenant's own
 * member list; `canAssignOwner` mirrors the server's permission check so the
 * control is not offered to a role the action will refuse.
 */
interface Props {
  relationship: RelationshipRow;
  interactions: InteractionRow[];
  members: WorkspaceMember[];
  canAssignOwner: boolean;
}

export default function RelationshipDetail({
  relationship: rel,
  interactions: initInteractions,
  members,
  canAssignOwner,
}: Props) {
  const t = useTranslations('Relationships');
  const [warmth, setWarmth] = useState(rel.warmth);
  const [nextStep, setNextStep] = useState(rel.nextStep || '');
  const [notes, setNotes] = useState(rel.notes || '');
  const [ownerUserId, setOwnerUserId] = useState(rel.ownerUserId ?? '');
  // Read-only after mount: nothing here re-sets this list, so the setter was dead.
  const [interactions] = useState(initInteractions);
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  /** What the last save said. The action can refuse, and a silent refusal on a
   *  screen with a Save button reads as success. */
  const [status, setStatus] = useState<'idle' | 'saved' | string>('idle');
  const errorText = useActionErrorText();

  /** An ended pilot is said in the status line; any other error goes on to the error boundary, as before. */
  const refuse = (err: unknown) => {
    const text = errorText(err, null);
    if (text === null) throw err;
    setStatus(text);
  };

  const handleSave = () => {
    setStatus('idle');
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof updateRelationship>>;
      try {
        result = await updateRelationship(rel.id, {
          warmth: warmth as 'cold' | 'warm' | 'hot' | 'active',
          nextStep,
          notes,
          // Only sent by someone the server would accept it from; the empty
          // option is a real value meaning "unassign".
          ...(canAssignOwner ? { ownerUserId: ownerUserId === '' ? null : ownerUserId } : {}),
        });
      } catch (err) {
        refuse(err);
        return;
      }
      if (result.success) {
        setStatus('saved');
        return;
      }
      setStatus(
        result.error === 'FORBIDDEN'
          ? t('ownerForbidden')
          : result.error === 'OWNER_NOT_IN_TENANT'
            ? t('ownerNotInTenant')
            : t('saveFailed')
      );
    });
  };

  const handleAddInteraction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      setStatus('idle');
      try {
        await addInteraction(rel.id, {
          kind: fd.get('kind') as string,
          at: fd.get('at') as string,
          summary: fd.get('summary') as string,
        });
      } catch (err) {
        refuse(err);
        return;
      }
      setShowForm(false);
    });
  };

  const warmthOptions = ['cold', 'warm', 'hot', 'active'] as const;

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="bg-surface border border-border rounded-2xl p-6 md:p-8 mb-6 shadow-xs">
        <h1 data-testid="relationship-title" className="text-2xl font-bold font-heading text-ink mb-1">
          {rel.counterpartName || rel.organizationId || t('unnamed')}
        </h1>
        <div className="flex gap-2 text-xs text-muted mb-6">
          <span className="bg-ground border border-border px-2 py-0.5 rounded">{rel.kind}</span>
          {rel.counterpartEmail && <span>{rel.counterpartEmail}</span>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">{t('warmth')}</label>
            <div className="flex flex-wrap gap-2">
              {warmthOptions.map((w) => (
                <button
                  key={w}
                  onClick={() => setWarmth(w)}
                  className={`px-3 py-1.5 rounded-lg text-xs capitalize border transition-all ${warmth === w ? 'bg-accent text-white border-accent font-semibold shadow-2xs' : 'border-border text-ink-2 hover:bg-surface-hover'}`}
                >
                  {t(w)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="rel-next-step" className="block text-xs font-semibold text-ink mb-1.5">
              {t('nextStep')}
            </label>
            <input
              id="rel-next-step"
              value={nextStep}
              onChange={(e) => setNextStep(e.target.value)}
              className="w-full bg-ground border border-border p-2.5 rounded-lg text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder={t('nextStepPlaceholder')}
            />
          </div>
        </div>

        {/* Focal point — who this relationship belongs to. */}
        <div className="mb-4">
          <label htmlFor="rel-owner" className="block text-xs font-semibold text-ink mb-1.5">
            {t('owner')}
          </label>
          {canAssignOwner ? (
            <>
              <select
                id="rel-owner"
                data-testid="relationship-owner"
                value={ownerUserId}
                onChange={(e) => setOwnerUserId(e.target.value)}
                className="w-full md:w-1/2 bg-ground border border-border p-2.5 rounded-lg text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="">{t('ownerUnassigned')}</option>
                {/* Name only. `WorkspaceMember.role` is a label the pipeline
                    store hard-codes in Turkish (`ROLE_LABELS`), so rendering it
                    here would put Turkish on the English screen. */}
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted mt-1">{t('ownerHint')}</p>
            </>
          ) : (
            <p data-testid="relationship-owner-readonly" className="text-xs text-ink-2">
              {members.find((m) => m.id === rel.ownerUserId)?.name ?? t('ownerUnassigned')}
            </p>
          )}
        </div>

        <div className="mb-4">
          <label htmlFor="rel-notes" className="block text-xs font-semibold text-ink mb-1.5">
            {t('notes')}
          </label>
          <textarea
            id="rel-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-ground border border-border p-2.5 rounded-lg text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            rows={3}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={isPending}
            data-testid="relationship-save"
            className="bg-accent text-white px-5 py-2 rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition shadow-2xs"
          >
            {isPending ? t('saving') : t('save')}
          </button>
          {status !== 'idle' && (
            <span
              data-testid="relationship-save-status"
              className={`text-xs ${status === 'saved' ? 'text-muted' : 'text-red-400'}`}
            >
              {status === 'saved' ? t('saved') : status}
            </span>
          )}
        </div>
      </div>

      {/* Interactions Timeline */}
      <div className="bg-surface border border-border rounded-2xl p-6 md:p-8 shadow-xs">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold font-heading text-ink">{t('timeline')}</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="text-xs bg-ground border border-border text-ink px-3 py-1.5 rounded-lg hover:bg-surface-hover transition font-medium"
          >
            {showForm ? t('cancel') : `+ ${t('logInteraction')}`}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleAddInteraction} className="bg-ground/50 p-4 rounded-xl mb-6 border border-border space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label htmlFor="ix-kind" className="block text-xs font-semibold text-ink mb-1">
                  {t('interactionType')}
                </label>
                <select id="ix-kind" name="kind" className="w-full bg-surface border border-border p-2 rounded-lg text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent">
                  <option value="meeting">{t('kindMeeting')}</option>
                  <option value="email">{t('kindEmail')}</option>
                  <option value="call">{t('kindCall')}</option>
                  <option value="event">{t('kindEvent')}</option>
                </select>
              </div>
              <div>
                <label htmlFor="ix-at" className="block text-xs font-semibold text-ink mb-1">
                  {t('interactionDate')}
                </label>
                <input id="ix-at" name="at" type="datetime-local" required className="w-full bg-surface border border-border p-2 rounded-lg text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent" />
              </div>
            </div>
            <div>
              <label htmlFor="ix-summary" className="block text-xs font-semibold text-ink mb-1">
                {t('interactionSummary')}
              </label>
              <textarea id="ix-summary" name="summary" className="w-full bg-surface border border-border p-2 rounded-lg text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent" rows={2} />
            </div>
            <button type="submit" disabled={isPending} className="bg-accent text-white px-4 py-2 rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition shadow-2xs">
              {t('saveInteraction')}
            </button>
          </form>
        )}

        <div className="space-y-4">
          {interactions.map((ix) => {
            const kindIcons: Record<string, string> = { meeting: '🤝', email: '📧', call: '📞', event: '📅' };
            return (
              <div key={ix.id} className="flex gap-4 border-l-2 border-accent/40 pl-4 py-1">
                <div className="text-xl">{kindIcons[ix.kind] || '📌'}</div>
                <div>
                  <div className="font-semibold text-xs text-ink capitalize">{ix.kind}</div>
                  <div className="text-[10px] text-muted font-mono">{new Date(ix.at).toLocaleString()}</div>
                  {ix.summary && <p className="text-xs text-ink-2 mt-1 leading-relaxed">{ix.summary}</p>}
                </div>
              </div>
            );
          })}
          {interactions.length === 0 && (
            <div className="text-center text-muted py-8 text-xs">{t('noInteractions')}</div>
          )}
        </div>
      </div>
    </div>
  );
}
