'use client';

import React, { useState } from 'react';
import { Mail, Check, Send, ShieldCheck, ShieldAlert, AlertCircle, RefreshCw } from 'lucide-react';
import { sendSmtpTestEmail } from './actions';

export interface SmtpSummary {
  host: string;
  port: number;
  secure: boolean;
  /** SMTP login, or null when the server is used without authentication. */
  user: string | null;
  from: string;
}

/**
 * Outgoing mail settings, read-only (TASK-MUMLF57HOYFSB).
 *
 * The SMTP server is configured through the environment (SMTP_HOST, SMTP_PORT,
 * SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM — see src/lib/email/mailer.ts),
 * and nothing else. This card used to offer editable fields and a "save"
 * button that stored nothing and reported success, and a "test" button that
 * sent nothing and reported a handshake. It now shows what the server really
 * uses, never the password, and the test sends a real mail.
 */
export function SmtpSettingsForm({ smtp }: { smtp: SmtpSummary | null }) {
  const [testEmail, setTestEmail] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleTestSmtp = async () => {
    setIsTesting(true);
    setStatusMessage(null);
    try {
      const result = await sendSmtpTestEmail(testEmail);
      if (result.ok) {
        setStatusMessage({ type: 'success', text: `Test e-postası SMTP sunucusuna teslim edildi: ${testEmail}` });
      } else if (result.error === 'invalid_address') {
        setStatusMessage({ type: 'error', text: 'Lütfen geçerli bir test e-postası adresi giriniz.' });
      } else if (result.error === 'not_configured') {
        setStatusMessage({ type: 'error', text: 'SMTP yapılandırılmamış (SMTP_HOST boş); e-posta gönderilemez.' });
      } else {
        setStatusMessage({ type: 'error', text: `SMTP gönderimi başarısız: ${result.error}` });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Test e-postası gönderilemedi.' });
    } finally {
      setIsTesting(false);
    }
  };

  const rows: Array<[string, string]> = smtp
    ? [
        ['SMTP Sunucu (SMTP_HOST)', smtp.host],
        ['Port (SMTP_PORT)', String(smtp.port)],
        ['Bağlantı (SMTP_SECURE)', smtp.secure ? 'SSL / TLS' : 'STARTTLS'],
        ['Kullanıcı (SMTP_USER)', smtp.user ?? 'kimlik doğrulamasız'],
        ['Gönderen (SMTP_FROM)', smtp.from],
      ]
    : [];

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h2 className="text-base font-bold text-ink flex items-center gap-2">
            <Mail className="w-5 h-5 text-indigo-400" />
            <span>SMTP E-posta Sunucusu</span>
          </h2>
          <p className="text-muted text-xs mt-0.5">
            Ekip davetleri ve sistem bildirimleri bu SMTP sunucusundan gider. Ayarlar sunucu ortam değişkenlerinden
            okunur (SMTP_*); buradan değiştirilemez.
          </p>
        </div>

        {smtp ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Yapılandırılmış</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold bg-bad/10 text-bad border border-bad/20 px-3 py-1 rounded-full">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Yapılandırılmamış</span>
          </span>
        )}
      </div>

      {smtp ? (
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 p-2 bg-ground rounded-xl border border-border">
              <dt className="text-ink-2">{label}</dt>
              <dd className="text-ink font-mono break-all text-right">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-xs text-bad">
          SMTP_HOST ayarlı değil: hiçbir e-posta gönderilmiyor. Üretimde her gönderim denemesi bir SystemAlert kaydı
          açar.
        </p>
      )}

      {statusMessage && (
        <div
          role="status"
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

      <div className="flex items-center gap-2 pt-3 border-t border-border text-xs">
        <label htmlFor="smtp-test-address" className="sr-only">
          Test e-postası adresi
        </label>
        <input
          id="smtp-test-address"
          type="email"
          value={testEmail}
          onChange={(e) => setTestEmail(e.target.value)}
          placeholder="Test e-postası adresi (Örn: test@domain.com)"
          className="bg-ground border border-border rounded-xl px-3 py-2 text-xs text-ink w-full sm:w-64 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={handleTestSmtp}
          disabled={isTesting || !smtp}
          className="bg-ground hover:bg-surface-hover text-ink border border-border font-semibold px-3 py-2 rounded-xl text-xs transition flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
        >
          {isTesting ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Gönderiliyor...</span>
            </>
          ) : (
            <>
              <Send className="w-3.5 h-3.5 text-indigo-400" />
              <span>SMTP Test Et</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
