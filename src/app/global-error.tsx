'use client';

import React from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="tr">
      <body className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-8 text-center shadow-xl space-y-4">
          <div className="w-16 h-16 bg-red-600/20 border border-red-500/40 rounded-full flex items-center justify-center mx-auto text-red-400 font-bold text-2xl font-mono">
            !
          </div>
          <h1 className="text-2xl font-bold font-heading text-white">Bir Hata Oluştu</h1>
          <p className="text-slate-400 text-sm leading-relaxed">
            Sistemde beklenmeyen bir hata meydana geldi: <span className="font-mono text-red-300 text-xs block mt-1">{error.message || 'Bilinmeyen Hata'}</span>
          </p>
          <div className="pt-4">
            <button
              onClick={() => reset()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-lg transition shadow-sm text-sm"
            >
              Yeniden Dene
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
