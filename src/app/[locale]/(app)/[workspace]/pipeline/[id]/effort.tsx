'use client';

import React, { useState } from 'react';

// Mock data
const MOCK_EFFORTS = [
  { id: '1', date: '2026-09-01', hours: 4.5, note: 'Read work programme and drafted concept note outline', user: 'Alice' },
  { id: '2', date: '2026-09-02', hours: 2.0, note: 'Partner search on CORDIS', user: 'Bob' },
];

export function EffortTracker({ opportunityId }: { opportunityId: string }) {
  const [efforts, setEfforts] = useState(MOCK_EFFORTS);
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hours || isNaN(Number(hours))) return;

    const newEffort = {
      id: Date.now().toString(),
      date,
      hours: Number(hours),
      note,
      user: 'You'
    };

    setEfforts([newEffort, ...efforts]);
    setHours('');
    setNote('');
  };

  const totalHours = efforts.reduce((sum, e) => sum + e.hours, 0);
  const personDays = (totalHours / 8).toFixed(1);

  return (
    <div className="space-y-6">
      <div className="bg-accent/10 p-4 rounded-xl border border-accent/20 flex justify-between items-center">
        <div>
          <h3 className="text-accent-ink font-bold text-base md:text-lg">Total Effort Logged</h3>
          <p className="text-muted text-xs">Used for ROI and cost tracking (1 person-day = 8 hours)</p>
        </div>
        <div className="text-right">
          <div className="text-2xl md:text-3xl font-bold text-accent-ink">{personDays} <span className="text-sm font-medium">PDs</span></div>
          <div className="text-xs text-muted">{totalHours} total hours</div>
        </div>
      </div>

      <form onSubmit={handleAdd} className="bg-ground p-4 rounded-xl border border-border grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        <div className="md:col-span-3">
          <label className="block text-xs font-semibold text-ink mb-1">Date</label>
          <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full p-2 bg-surface border border-border rounded-lg text-xs text-ink" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-ink mb-1">Hours</label>
          <input type="number" step="0.5" min="0.5" required value={hours} onChange={e => setHours(e.target.value)} className="w-full p-2 bg-surface border border-border rounded-lg text-xs text-ink" placeholder="e.g. 2.5" />
        </div>
        <div className="md:col-span-5">
          <label className="block text-xs font-semibold text-ink mb-1">Note (Optional)</label>
          <input type="text" value={note} onChange={e => setNote(e.target.value)} className="w-full p-2 bg-surface border border-border rounded-lg text-xs text-ink placeholder:text-muted" placeholder="What did you work on?" />
        </div>
        <div className="md:col-span-2">
          <button type="submit" className="w-full bg-accent text-white font-semibold py-2 px-4 rounded-lg text-xs hover:opacity-90 transition shadow-2xs">
            Log Effort
          </button>
        </div>
      </form>

      <div className="border border-border rounded-xl overflow-hidden bg-surface">
        <table className="w-full text-left text-xs">
          <thead className="bg-ground/60 border-b border-border text-muted">
            <tr>
              <th className="px-4 py-2.5 font-semibold uppercase">Date</th>
              <th className="px-4 py-2.5 font-semibold uppercase">User</th>
              <th className="px-4 py-2.5 font-semibold uppercase">Hours</th>
              <th className="px-4 py-2.5 font-semibold uppercase">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {efforts.map(e => (
              <tr key={e.id} className="hover:bg-surface-hover transition-colors">
                <td className="px-4 py-3 text-ink font-mono">{e.date}</td>
                <td className="px-4 py-3 text-ink-2 font-medium">{e.user}</td>
                <td className="px-4 py-3 font-semibold text-ink">{e.hours}h</td>
                <td className="px-4 py-3 text-muted">{e.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
