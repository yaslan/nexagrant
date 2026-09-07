'use client';

import React, { useState, useTransition } from 'react';
import { updateRelationship, addInteraction } from '../actions';
import type { InteractionRow, RelationshipRow } from '@/types/db-rows';

/**
 * The row shapes come from `@/types/db-rows`, which is kept against
 * prisma/schema.prisma. The hand-written local types they replace claimed
 * `Relationship.status`, `.remindAt`, `.createdAt` and `Interaction.createdAt`
 * — none of which exist as columns — and typed `Interaction.summary` as
 * non-null when the column is `String?`. Nothing here read those fields, so
 * they rendered nothing; they were a standing invitation to add a `rel.status`
 * badge that would always be `undefined`.
 */
interface Props {
  relationship: RelationshipRow;
  interactions: InteractionRow[];
}

export default function RelationshipDetail({ relationship: rel, interactions: initInteractions }: Props) {
  const [warmth, setWarmth] = useState(rel.warmth);
  const [nextStep, setNextStep] = useState(rel.nextStep || '');
  const [notes, setNotes] = useState(rel.notes || '');
  const [interactions, setInteractions] = useState(initInteractions);
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    startTransition(async () => {
      await updateRelationship(rel.id, { warmth, nextStep, notes });
    });
  };

  const handleAddInteraction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await addInteraction(rel.id, {
        kind: fd.get('kind') as string,
        at: fd.get('at') as string,
        summary: fd.get('summary') as string,
      });
      setShowForm(false);
    });
  };

  const warmthOptions = ['cold', 'warm', 'hot', 'active'];

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="bg-surface border border-border rounded-2xl p-6 md:p-8 mb-6 shadow-xs">
        <h1 data-testid="relationship-title" className="text-2xl font-bold font-heading text-ink mb-1">
          {rel.counterpartName || rel.organizationId || 'Unnamed'}
        </h1>
        <div className="flex gap-2 text-xs text-muted mb-6">
          <span className="bg-ground border border-border px-2 py-0.5 rounded">{rel.kind}</span>
          {rel.counterpartEmail && <span>{rel.counterpartEmail}</span>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Warmth</label>
            <div className="flex flex-wrap gap-2">
              {warmthOptions.map((w) => (
                <button
                  key={w}
                  onClick={() => setWarmth(w)}
                  className={`px-3 py-1.5 rounded-lg text-xs capitalize border transition-all ${warmth === w ? 'bg-accent text-white border-accent font-semibold shadow-2xs' : 'border-border text-ink-2 hover:bg-surface-hover'}`}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Next Step</label>
            <input
              value={nextStep}
              onChange={(e) => setNextStep(e.target.value)}
              className="w-full bg-ground border border-border p-2.5 rounded-lg text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="e.g. Send partnership proposal"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-ink mb-1.5">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-ground border border-border p-2.5 rounded-lg text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            rows={3}
          />
        </div>

        <button
          onClick={handleSave}
          disabled={isPending}
          className="bg-accent text-white px-5 py-2 rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition shadow-2xs"
        >
          {isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Interactions Timeline */}
      <div className="bg-surface border border-border rounded-2xl p-6 md:p-8 shadow-xs">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold font-heading text-ink">Interaction Timeline</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="text-xs bg-ground border border-border text-ink px-3 py-1.5 rounded-lg hover:bg-surface-hover transition font-medium"
          >
            {showForm ? 'Cancel' : '+ Log Interaction'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleAddInteraction} className="bg-ground/50 p-4 rounded-xl mb-6 border border-border space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Type</label>
                <select name="kind" className="w-full bg-surface border border-border p-2 rounded-lg text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent">
                  <option value="meeting">Meeting</option>
                  <option value="email">Email</option>
                  <option value="call">Call</option>
                  <option value="event">Event</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Date</label>
                <input name="at" type="datetime-local" required className="w-full bg-surface border border-border p-2 rounded-lg text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink mb-1">Summary</label>
              <textarea name="summary" className="w-full bg-surface border border-border p-2 rounded-lg text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent" rows={2} />
            </div>
            <button type="submit" disabled={isPending} className="bg-accent text-white px-4 py-2 rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition shadow-2xs">
              Save Interaction
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
            <div className="text-center text-muted py-8 text-xs">No interactions logged yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
