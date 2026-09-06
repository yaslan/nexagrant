'use client';

import React, { useState } from 'react';
import { DEFAULT_GATE_RULES, DEFAULT_SCORING_WEIGHTS } from '@/lib/scoring/defaults';

export default function GateSettingsPage() {
  const [minG0Score, setMinG0Score] = useState(DEFAULT_GATE_RULES.G0.minScore);
  const [minBaseRate, setMinBaseRate] = useState(DEFAULT_GATE_RULES.G0.minBaseRate);
  
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    // Mock save
    await new Promise(resolve => setTimeout(resolve, 800));
    alert('Settings saved successfully!');
    setSaving(false);
  };

  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Stage-Gate Settings</h1>
      <p className="text-ink-2 mb-8">
        Configure the mathematical thresholds and rules for your opportunity pipeline.
      </p>

      <form onSubmit={handleSave} className="space-y-8 bg-surface p-6 rounded-lg shadow-sm border border-border">
        
        <div>
          <h2 className="text-lg font-semibold border-b border-border pb-2 mb-4">G0: Triage Rules</h2>
          
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-ink-2 mb-1">Minimum AI Alignment Score (0-100)</label>
              <input 
                type="number"
                value={minG0Score}
                onChange={e => setMinG0Score(Number(e.target.value))}
                className="w-full p-2 border border-border rounded-md"
              />
              <p className="text-xs text-muted mt-1">Opportunities below this score will fail G0.</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-ink-2 mb-1">Minimum Base Rate (%)</label>
              <input 
                type="number"
                value={minBaseRate}
                onChange={e => setMinBaseRate(Number(e.target.value))}
                className="w-full p-2 border border-border rounded-md"
              />
              <p className="text-xs text-muted mt-1">Based on historical HE dashboard data.</p>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold border-b border-border pb-2 mb-4">G0: Scoring Weights</h2>
          <p className="text-sm text-ink-2 mb-4">Total must equal 100. These weights determine how the final G0 score is calculated.</p>
          
          <div className="grid grid-cols-2 gap-4">
            {Object.entries(DEFAULT_SCORING_WEIGHTS).map(([key, value]) => (
              <div key={key} className="flex justify-between items-center bg-ground p-2 rounded border border-border">
                <span className="text-sm font-medium text-ink-2">{key}</span>
                <span className="text-sm text-ink font-mono">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <button 
          type="submit" 
          disabled={saving}
          className="bg-blue-600 text-white font-medium py-2 px-6 rounded-md hover:bg-blue-700 transition disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </form>
    </div>
  );
}
