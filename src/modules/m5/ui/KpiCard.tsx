'use client';

import { useId } from 'react';
import Link from 'next/link';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis } from 'recharts';

export interface KpiCardProps {
  title: string;
  value: number | string;
  unit?: string;
  trend?: 'up' | 'down' | 'neutral';
  description?: string;
  chartData?: Array<{ date: string; value: number }>;
  variant?: 'default' | 'success' | 'warning';
  /**
   * This card has no measurement yet, and `value` holds the reason in words rather
   * than a number. The value slot then drops to body size and the muted colour, so a
   * missing figure never shouts louder than a real one across a row of cards.
   * Callers pass no `unit`: there is no "0.0 %" left to qualify.
   */
  unmeasured?: boolean;
  /**
   * Where the metric is worked on. Given, the whole card is one link (and the only focus
   * stop in it); left out — for a reader whose role cannot open the target — the card
   * stays a plain, unclickable block.
   */
  href?: string;
  /** Accessible name of the link; the figure and description are read as its description. */
  ariaLabel?: string;
}

export function KpiCard({
  title,
  value,
  unit,
  trend,
  description,
  chartData,
  variant = 'default',
  unmeasured = false,
  href,
  ariaLabel,
}: KpiCardProps) {
  const bodyId = useId();

  const variantClasses = {
    default: 'border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950',
    success: 'border-l-4 border-green-500 bg-green-50 dark:bg-green-950',
    warning: 'border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950',
  };

  const trendClasses = {
    up: 'text-green-600 dark:text-green-400',
    down: 'text-red-600 dark:text-red-400',
    neutral: 'text-gray-600 dark:text-gray-400',
  };

  const frameClasses = `rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700 ${variantClasses[variant]}`;

  const body = (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {title}
          </h3>
        </div>
        {trend && (
          <div className={`text-lg font-semibold ${trendClasses[trend]}`}>
            {trend === 'up' && '↑'}
            {trend === 'down' && '↓'}
            {trend === 'neutral' && '→'}
          </div>
        )}
      </div>

      {/* Metric */}
      <div id={href ? bodyId : undefined} className="mb-4">
        <div className="flex items-baseline gap-2">
          <span
            className={
              unmeasured
                ? 'text-base font-medium text-gray-500 dark:text-gray-400'
                : 'text-3xl font-bold text-gray-900 dark:text-white'
            }
          >
            {typeof value === 'number' ? value.toFixed(1) : value}
          </span>
          {unit && (
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
              {unit}
            </span>
          )}
        </div>
      </div>

      {/* Chart (if data provided) */}
      {chartData && chartData.length > 0 && (
        <div className="mb-4 h-12">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis dataKey="date" hide />
              <YAxis hide domain={['dataMin', 'dataMax']} />
              <Line
                type="monotone"
                dataKey="value"
                stroke={
                  variant === 'success'
                    ? '#10b981'
                    : variant === 'warning'
                    ? '#f59e0b'
                    : '#3b82f6'
                }
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Description */}
      {description && (
        <p id={href ? `${bodyId}-desc` : undefined} className="text-xs text-gray-600 dark:text-gray-400">
          {description}
        </p>
      )}
    </>
  );

  if (!href) return <div className={frameClasses}>{body}</div>;

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      aria-describedby={description ? `${bodyId} ${bodyId}-desc` : bodyId}
      className={`block ${frameClasses} transition-shadow hover:shadow-md hover:ring-1 hover:ring-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:hover:ring-blue-500`}
    >
      {body}
    </Link>
  );
}
