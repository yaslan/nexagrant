'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { EffortTracker } from './effort';

// Mock data
const getOpportunity = (id: string) => ({
  id,
  title: 'Advanced AI solutions for climate modeling',
  topicId: 'HORIZON-CL5-2026-09-D4-01',
  stage: 'G0',
  g0Score: 92,
  status: 'ACTIVE',
  intendedRole: 'coordinator'
});

export default function OpportunityDetailPage({ params }: { params: { id: string } }) {
  const opp = getOpportunity(params.id);
  const [activeTab, setActiveTab] = useState('overview');

  const handleEvaluateGate = async () => {
    alert(`Evaluating Gate ${opp.stage}...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    alert('Evaluation passed! Moving to G1.');
  };

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8">
      <div className="mb-6">
        <Link href="./" className="text-accent hover:underline text-sm font-medium flex items-center gap-1">
          ← Back to Pipeline
        </Link>
      </div>

      <div className="bg-surface p-6 md:p-8 rounded-xl shadow-xs border border-border mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold bg-accent/15 text-accent-ink border border-accent/20 px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">
                {opp.stage}
              </span>
              <span className="text-xs font-semibold bg-ok/15 text-ok border border-ok/20 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                {opp.status}
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold font-heading text-ink mb-2">{opp.title}</h1>
            <p className="text-muted font-mono text-sm">{opp.topicId}</p>
          </div>
          
          <button 
            onClick={handleEvaluateGate}
            className="bg-accent hover:opacity-90 text-white font-semibold py-2.5 px-6 rounded-lg transition shadow-2xs shrink-0"
          >
            Evaluate Gate {opp.stage}
          </button>
        </div>

        <div className="flex border-b border-border mt-8 gap-2">
          <button 
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition ${activeTab === 'overview' ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink hover:border-border'}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button 
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition ${activeTab === 'tasks' ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink hover:border-border'}`}
            onClick={() => setActiveTab('tasks')}
          >
            T-6 Tasks
          </button>
          <button 
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition ${activeTab === 'effort' ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink hover:border-border'}`}
            onClick={() => setActiveTab('effort')}
          >
            Effort Logging
          </button>
        </div>

        <div className="py-6">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-ground border border-border p-4 rounded-xl">
                  <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">G0 Score</h3>
                  <p className="text-2xl font-bold text-ink">{opp.g0Score}/100</p>
                </div>
                <div className="bg-ground border border-border p-4 rounded-xl">
                  <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Intended Role</h3>
                  <p className="text-2xl font-bold text-ink capitalize">{opp.intendedRole}</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="space-y-3">
              <p className="text-muted text-sm mb-4">T-6 Plan Template Checklist (Mock)</p>
              <ul className="space-y-2 text-sm text-ink-2">
                <li className="flex items-center gap-2.5 bg-ground p-3 rounded-lg border border-border">
                  <input type="checkbox" checked readOnly className="accent-accent" />
                  <span>T-6: Read Work Programme</span>
                </li>
                <li className="flex items-center gap-2.5 bg-ground p-3 rounded-lg border border-border">
                  <input type="checkbox" className="accent-accent" />
                  <span>T-5: Identify Partners</span>
                </li>
                <li className="flex items-center gap-2.5 bg-ground p-3 rounded-lg border border-border">
                  <input type="checkbox" className="accent-accent" />
                  <span>T-4: Concept Note Draft</span>
                </li>
              </ul>
            </div>
          )}

          {activeTab === 'effort' && (
            <EffortTracker opportunityId={opp.id} />
          )}
        </div>
      </div>
    </div>
  );
}
