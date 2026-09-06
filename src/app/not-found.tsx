import React from 'react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-8 text-center shadow-xl space-y-4">
        <div className="w-16 h-16 bg-blue-600/20 border border-blue-500/40 rounded-full flex items-center justify-center mx-auto text-blue-400 font-bold text-2xl font-mono">
          404
        </div>
        <h1 className="text-2xl font-bold font-heading text-white">Sayfa Bulunamadı</h1>
        <p className="text-slate-400 text-sm leading-relaxed">
          Aradığınız sayfa veya geçerli bağlantı mevcut değil ya da kaldırılmış olabilir.
        </p>
        <div className="pt-4">
          <Link
            href="/tr"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-lg transition shadow-sm text-sm"
          >
            Ana Sayfaya Dön
          </Link>
        </div>
      </div>
    </div>
  );
}
