'use client';

import { useState, useCallback } from 'react';
import { KpiCard } from './KpiCard';
import { DateRangeFilter } from './DateRangeFilter';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import type { KpiMetrics } from '../server/queries';

export interface DashboardProps {
  initialMetrics: KpiMetrics;
  trendData: Array<{ date: string; metric: string; value: number }>;
  tenantId: string;
}

export function Dashboard({
  initialMetrics,
  trendData,
  tenantId,
}: DashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'trends' | 'export'>(
    'overview'
  );
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    to: new Date(),
  });

  const handleExport = useCallback(async () => {
    // Prepare CSV data
    const rows = [
      ['Date', 'Metric', 'Value'],
      ...trendData.map((row) => [
        row.date,
        row.metric,
        row.value.toString(),
      ]),
    ];

    const csv = rows.map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `fabrika-dashboard-${new Date().toISOString().split('T')[0]}.csv`
    );
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [trendData]);

  // Transform trend data for Recharts
  const offersData = trendData
    .filter((d) => d.metric === 'offers')
    .map((d) => ({
      date: d.date,
      offers: d.value,
    }));

  const successRateData = trendData
    .filter((d) => d.metric === 'success_rate')
    .map((d) => ({
      date: d.date,
      successRate: d.value,
    }));

  // Merge data by date
  const mergedTrendData = offersData.map((item) => {
    const successItem = successRateData.find((d) => d.date === item.date);
    return {
      date: item.date,
      offers: item.offers,
      successRate: successItem?.successRate || 0,
    };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Pipeline Dashboard
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Real-time metrics and trends
          </p>
        </div>
        <DateRangeFilter
          from={dateRange.from}
          to={dateRange.to}
          onChange={setDateRange}
        />
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('trends')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'trends'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
          }`}
        >
          Trends
        </button>
        <button
          onClick={() => setActiveTab('export')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'export'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
          }`}
        >
          Export
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiCard
            title="Total Offers"
            value={initialMetrics.totalOffers}
            unit="projects"
            description="Active opportunities in this period"
            variant="default"
          />
          <KpiCard
            title="Success Rate"
            value={initialMetrics.successRate}
            unit="%"
            description="Funded or above-threshold proposals"
            variant="success"
          />
          <KpiCard
            title="Average Score"
            value={initialMetrics.averageScore}
            unit="/100"
            description="Average evaluation score"
            variant="default"
          />
          <KpiCard
            title="Person-Days"
            value={initialMetrics.personDays}
            unit="days"
            description="Total effort in person-days"
            variant="default"
          />
          <KpiCard
            title="G0→G2 Timeline"
            value={initialMetrics.g0ToG2Days}
            unit="days"
            description="Average gate progression time"
            variant="warning"
          />
          <KpiCard
            title="Active Modules"
            value={initialMetrics.activeModules}
            unit="modules"
            description="Enabled platform modules"
            variant="success"
          />
        </div>
      )}

      {/* Trends Tab */}
      {activeTab === 'trends' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Offers & Success Rate
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={mergedTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="offers"
                  stroke="#3b82f6"
                  dot={false}
                  name="Offers"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="successRate"
                  stroke="#10b981"
                  dot={false}
                  name="Success Rate (%)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Export Tab */}
      {activeTab === 'export' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            Export Data
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Export trend data as CSV for analysis and reporting.
          </p>
          <button
            onClick={handleExport}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Export CSV
          </button>
        </div>
      )}
    </div>
  );
}
