import React from 'react';
import Link from 'next/link';
import { moduleGate } from '@/lib/modules/guard';

// Mock data
const MOCK_REPORTS = [
  { opportunityId: 'opp_1', title: 'Advanced AI solutions for climate modeling', user: 'Alice', hours: 12.5 },
  { opportunityId: 'opp_1', title: 'Advanced AI solutions for climate modeling', user: 'Bob', hours: 8.0 },
  { opportunityId: 'opp_2', title: 'Quantum computing algorithms for SMEs', user: 'Alice', hours: 4.0 },
  { opportunityId: 'opp_3', title: 'Smart grids optimization', user: 'Charlie', hours: 16.0 },
];

export default async function PersonDaysReportPage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale } = await params;
  const locked = await moduleGate('M5', locale);
  if (locked) return locked;

  const groupBy = 'opportunity';

  let groupedData: { title: string, hours: number }[] = [];
  
  if (groupBy === 'opportunity') {
    const opps: Record<string, { title: string, hours: number }> = {};
    for (const r of MOCK_REPORTS) {
      if (!opps[r.opportunityId]) opps[r.opportunityId] = { title: r.title, hours: 0 };
      opps[r.opportunityId].hours += r.hours;
    }
    groupedData = Object.values(opps);
  } else {
    const users: Record<string, { title: string, hours: number }> = {};
    for (const r of MOCK_REPORTS) {
      if (!users[r.user]) users[r.user] = { title: r.user, hours: 0 };
      users[r.user].hours += r.hours;
    }
    groupedData = Object.values(users);
  }

  const totalHours = groupedData.reduce((sum, item) => sum + item.hours, 0);

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-2">Person-Days Report</h1>
      <p className="text-ink-2 mb-8">
        Track effort investment across all opportunities in your pipeline.
      </p>

      <div className="bg-surface rounded-lg shadow-sm border border-border overflow-hidden mb-8">
        <div className="p-4 bg-ground border-b border-border flex justify-between items-center">
          <div className="flex gap-2">
            <span className="px-4 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white">
              By Opportunity
            </span>
          </div>
          <div className="text-sm font-medium text-ink-2">
            Total: {totalHours} hours ({(totalHours/8).toFixed(1)} PDs)
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[500px]">
          <thead className="bg-surface border-b border-border text-muted uppercase tracking-wider text-xs">
            <tr>
              <th className="px-6 py-3 font-semibold">{groupBy === 'opportunity' ? 'Opportunity' : 'User'}</th>
              <th className="px-6 py-3 font-semibold text-right">Total Hours</th>
              <th className="px-6 py-3 font-semibold text-right">Person-Days</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {groupedData.map((row, i) => (
              <tr key={i} className="hover:bg-ground">
                <td className="px-6 py-4 text-ink font-medium">
                  {groupBy === 'opportunity' ? (
                    <Link href={`../pipeline/mock_id`} className="text-blue-600 hover:underline">{row.title}</Link>
                  ) : (
                    row.title
                  )}
                </td>
                <td className="px-6 py-4 text-ink text-right">{row.hours}</td>
                <td className="px-6 py-4 text-ink font-semibold text-right">{(row.hours / 8).toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
