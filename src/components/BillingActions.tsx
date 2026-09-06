'use client';

import React from 'react';

export function BillingActions({ hasSubscription }: { hasSubscription: boolean }) {
  const handleManage = async () => {
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert('Failed to load portal: ' + data.error);
      }
    } catch (err) {
      alert('Error opening customer portal');
    }
  };

  const handleUpgrade = async () => {
    try {
      const res = await fetch('/api/billing/checkout', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: 'price_starter_dummy' }) 
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert('Failed to load checkout: ' + data.error);
      }
    } catch (err) {
      alert('Error opening checkout');
    }
  };

  return (
    <div className="flex gap-4">
      <button onClick={handleManage} className="bg-surface text-ink-2 border border-border px-4 py-2 rounded font-medium flex-1 hover:bg-ground">
        Manage Subscription
      </button>
      <button onClick={handleUpgrade} className="bg-accent-ink text-surface px-4 py-2 rounded font-medium flex-1 hover:bg-opacity-90">
        Upgrade Plan
      </button>
    </div>
  );
}
