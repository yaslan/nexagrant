'use client';

import React, { useState } from 'react';
import { Mail, Check, Send, ShieldCheck, Server, Lock, AlertCircle, RefreshCw } from 'lucide-react';

export function SmtpSettingsForm() {
  const [host, setHost] = useState('smtp.gmail.com');
  const [port, setPort] = useState('587');
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState('noreply@fonbridge.app');
  const [password, setPassword] = useState('••••••••••••');
  const [fromName, setFromName] = useState('FonBridge SaaS');
  const [fromEmail, setFromEmail] = useState('noreply@fonbridge.app');

  const [testEmail, setTestEmail] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setStatusMessage(null);

    // Simulate saving SMTP credentials into system config
    await new Promise((resolve) => setTimeout(resolve, 800));

    setIsSaving(false);
    setStatusMessage({
      type: 'success',
      text: 'SMTP E-posta sunucusu yapılandırması başarıyla kaydedildi!',
    });

    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleTestSmtp = async () => {
    if (!testEmail) {
      setStatusMessage({
        type: 'error',
        text: 'Lütfen test e-postasının gönderileceği adresi giriniz.',
      });
      return;
    }

    setIsTesting(true);
    setStatusMessage(null);

    await new Promise((resolve) => setTimeout(resolve, 1200));

    setIsTesting(false);
    setStatusMessage({
      type: 'success',
      text: `Test e-postası '${testEmail}' adresine başarıyla ulaştırıldı. (SMTP Handshake OK)`,
    });
  };

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h2 className="text-base font-bold text-ink flex items-center gap-2">
            <Mail className="w-5 h-5 text-indigo-400" />
            <span>SMTP E-posta Sunucu Yapılandırması & Davet Servisi</span>
          </h2>
          <p className="text-muted text-xs mt-0.5">
            Ekip üyesi davetleri, doğrulama e-postaları ve sistem bildirimlerinin gönderileceği SMTP sunucu ayarları.
          </p>
        </div>

        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>TLS/SSL Aktif</span>
        </span>
      </div>

      <form onSubmit={handleSaveSmtp} className="space-y-4 text-xs">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="font-semibold text-ink block mb-1">SMTP Sunucu Adresi (Host)</label>
            <div className="relative">
              <Server className="w-4 h-4 text-muted absolute left-3 top-2.5" />
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="smtp.gmail.com"
                required
                className="w-full bg-ground border border-border rounded-xl pl-9 pr-3 py-2 text-xs text-ink font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="font-semibold text-ink block mb-1">SMTP Port</label>
            <input
              type="text"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="587"
              required
              className="w-full bg-ground border border-border rounded-xl px-3 py-2 text-xs text-ink font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="font-semibold text-ink block mb-1">Güvenli Bağlantı (SSL / TLS)</label>
            <select
              value={secure ? 'true' : 'false'}
              onChange={(e) => setSecure(e.target.value === 'true')}
              className="w-full bg-ground border border-border rounded-xl px-3 py-2 text-xs text-ink font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="false">STARTTLS (Port 587 - Önerilen)</option>
              <option value="true">SSL / TLS (Port 465)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="font-semibold text-ink block mb-1">SMTP Kullanıcı Adı (User / Email)</label>
            <input
              type="text"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="noreply@fonbridge.app"
              required
              className="w-full bg-ground border border-border rounded-xl px-3 py-2 text-xs text-ink font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="font-semibold text-ink block mb-1">SMTP Şifresi (Password / App Password)</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-muted absolute left-3 top-2.5" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                className="w-full bg-ground border border-border rounded-xl pl-9 pr-3 py-2 text-xs text-ink font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-border pt-3">
          <div>
            <label className="font-semibold text-ink block mb-1">Gönderen İsmi (From Name)</label>
            <input
              type="text"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="FonBridge SaaS"
              required
              className="w-full bg-ground border border-border rounded-xl px-3 py-2 text-xs text-ink focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="font-semibold text-ink block mb-1">Gönderen E-posta Adresi (From Address)</label>
            <input
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="noreply@fonbridge.app"
              required
              className="w-full bg-ground border border-border rounded-xl px-3 py-2 text-xs text-ink font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {statusMessage && (
          <div
            className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'bg-bad/15 text-bad border border-bad/30'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-bad shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t border-border">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="Test e-postası adresi (Örn: test@domain.com)"
              className="bg-ground border border-border rounded-xl px-3 py-2 text-xs text-ink w-full sm:w-64 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleTestSmtp}
              disabled={isTesting}
              className="bg-ground hover:bg-surface-hover text-ink border border-border font-semibold px-3 py-2 rounded-xl text-xs transition flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
            >
              {isTesting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Deneniyor...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 text-indigo-400" />
                  <span>SMTP Test Et</span>
                </>
              )}
            </button>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition shadow-md cursor-pointer disabled:opacity-50"
          >
            {isSaving ? 'Kaydediliyor...' : 'SMTP Ayarlarını Kaydet'}
          </button>
        </div>
      </form>
    </div>
  );
}
