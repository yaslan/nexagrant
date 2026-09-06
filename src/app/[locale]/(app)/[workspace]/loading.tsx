import React from 'react';

export default function WorkspaceLoading() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="bg-slate-200/80 rounded-2xl h-36 w-full shadow-xs" />

      {/* Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-200/60 rounded-2xl h-48 w-full" />
        <div className="bg-slate-200/60 rounded-2xl h-48 w-full" />
        <div className="bg-slate-200/60 rounded-2xl h-48 w-full" />
      </div>

      {/* Table / List Skeleton */}
      <div className="bg-slate-200/70 rounded-2xl h-64 w-full" />
    </div>
  );
}
