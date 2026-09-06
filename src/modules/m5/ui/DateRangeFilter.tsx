'use client';

import { useState } from 'react';

export interface DateRangeFilterProps {
  from: Date;
  to: Date;
  onChange: (range: { from: Date; to: Date }) => void;
}

export function DateRangeFilter({
  from,
  to,
  onChange,
}: DateRangeFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [preset, setPreset] = useState('30d');

  const handlePreset = (p: string) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let newFrom: Date;

    switch (p) {
      case '7d':
        newFrom = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        newFrom = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        newFrom = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'year':
        newFrom = new Date(today.getFullYear(), 0, 1);
        break;
      default:
        return;
    }

    setPreset(p);
    onChange({ from: newFrom, to: today });
    setIsOpen(false);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium text-sm flex items-center gap-2"
      >
        📅 {formatDate(from)} — {formatDate(to)}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10">
          <div className="p-4 space-y-3">
            <div className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Quick Select
            </div>
            {[
              { label: 'Last 7 days', value: '7d' },
              { label: 'Last 30 days', value: '30d' },
              { label: 'This month', value: 'month' },
              { label: 'This year', value: 'year' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => handlePreset(option.value)}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                  preset === option.value
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 font-medium'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
