'use client';

import React, { useState } from 'react';
import {
  Key,
  Plus,
  Copy,
  Check,
  Trash2,
  Code,
  ShieldCheck,
  Lock,
} from 'lucide-react';
import { useActionErrorText } from '@/lib/hooks/use-action-error-text';
import { generateApiKey, revokeApiKey, type ApiKeyActionError } from './actions';

export interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt?: string | Date | null;
  createdAt: string | Date;
}

const ACTION_ERROR_TEXT: Record<ApiKeyActionError, string> = {
  forbidden: 'API anahtarlarını yalnızca kurum sahibi veya yöneticisi yönetebilir.',
  invalidName: 'Anahtar adı 1 ile 100 karakter arasında olmalı.',
};

interface ApiKeysClientProps {
  apiKeys: ApiKeyRecord[];
  /** The app's own origin for the code samples (NEXT_PUBLIC_APP_URL, TASK-MUN3OAFIVW9NA). */
  apiBaseUrl: string;
}

// The tenant and user are not props: `generateApiKey` resolves both from the session,
// and a client component that carries a tenant id is one prop away from naming someone
// else's workspace. Both were passed in and never read.
export function ApiKeysClient({ apiKeys: initialKeys, apiBaseUrl }: ApiKeysClientProps) {
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>(initialKeys);
  const [keyName, setKeyName] = useState('');
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeCodeTab, setActiveCodeTab] = useState<'curl' | 'javascript' | 'python'>('curl');
  const errorText = useActionErrorText();

  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;

    setIsGenerating(true);
    setActionError(null);
    try {
      const res = await generateApiKey({
        name: keyName.trim(),
      });

      if ('error' in res) {
        setActionError(ACTION_ERROR_TEXT[res.error]);
      } else if (res.rawKey) {
        setNewRawKey(res.rawKey);
        setApiKeys((prev) => [
          {
            id: res.apiKeyRecord.id,
            name: keyName.trim(),
            prefix: res.apiKeyRecord.prefix,
            createdAt: new Date().toISOString(),
            lastUsedAt: null,
          },
          ...prev,
        ]);
        setKeyName('');
      }
    } catch (err) {
      console.error('Error generating API key:', err);
      setActionError(errorText(err, null));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRevokeKey = async (id: string, name: string) => {
    if (confirm(`"${name}" adlı API anahtarını iptal etmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) {
      setActionError(null);
      let res: Awaited<ReturnType<typeof revokeApiKey>>;
      try {
        res = await revokeApiKey(id);
      } catch (err) {
        setActionError(errorText(err, null));
        return;
      }
      if ('error' in res && res.error) {
        setActionError(ACTION_ERROR_TEXT[res.error]);
        return;
      }
      setApiKeys((prev) => prev.filter((k) => k.id !== id));
    }
  };

  const sampleKey = newRawKey || 'fp_live_8f3d1e9a2b7c4d5e6f0a1b2c';

  return (
    <div className="space-y-6">
      {/* ──────────────────────── HEADER BANNER ──────────────────────── */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-purple-400 font-semibold tracking-wider uppercase mb-1">
              <Key className="w-4 h-4 text-purple-400" />
              <span>Partner Intelligence REST API</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight font-heading text-white">
              API Anahtarları & B2B Geliştirici Portalı
            </h1>
            <p className="text-muted text-xs md:text-sm mt-1 max-w-2xl">
              CORDIS ortak zekası, açık çağrılar ve fırsat pipeline verilerinizi kurum içi ERP/CRM sistemlerinize entegre edin.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs bg-slate-800 border border-slate-700 text-purple-400 px-3.5 py-1.5 rounded-full font-mono font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-purple-400" />
              <span>v1 REST API Aktif</span>
            </span>
          </div>
        </div>

        {/* Top Summary Info */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-800 text-xs">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">Aktif API Anahtarı</span>
            <span className="text-xl font-bold text-white font-mono mt-0.5 block">
              {apiKeys.length} <span className="text-xs text-muted">Anahtar</span>
            </span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">Hız Limiti (Rate Limit)</span>
            <span className="text-xl font-bold text-emerald-400 font-mono mt-0.5 block">
              1,000 <span className="text-xs text-muted">istek / dk</span>
            </span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">Protokol & Format</span>
            <span className="text-xs font-bold text-blue-300 font-mono mt-1 block">
              HTTPS REST / JSON
            </span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">Yetkilendirme</span>
            <span className="text-xs font-bold text-purple-300 font-mono mt-1 block">
              x-api-key / Bearer
            </span>
          </div>
        </div>
      </div>

      {/* ──────────────────────── API KEYS MANAGEMENT GRID ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Generate Form (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b pb-3">
              <Plus className="w-4 h-4 text-purple-600" />
              <h3 className="font-bold text-sm text-ink">Yeni API Anahtarı Oluştur</h3>
            </div>

            <form onSubmit={handleGenerateKey} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-ink-2 block mb-1">Anahtar Adı / Servis Tanımı</label>
                <input
                  type="text"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="Örn: SAP ERP Pipeline Senkronu"
                  required
                  maxLength={100}
                  className="w-full border border-border rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none bg-ground font-semibold"
                />
              </div>

              <div className="bg-ground p-3 rounded-xl border border-border text-[11px] text-ink-2 space-y-1">
                <span className="font-bold text-ink flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-purple-600" />
                  <span>Güvenlik Uyarısı:</span>
                </span>
                <p>Üretilen anahtar yalnızca bir kez tam olarak gösterilir. Lütfen güvenli bir ortamda saklayın.</p>
              </div>

              {actionError && (
                <p role="alert" className="text-red-600 font-semibold">
                  {actionError}
                </p>
              )}

              <button
                type="submit"
                disabled={isGenerating}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 rounded-xl transition shadow-xs text-xs flex items-center justify-center gap-2"
              >
                <Key className="w-3.5 h-3.5" />
                <span>{isGenerating ? 'Üretiliyor...' : 'API Key Oluştur (fp_live_...)'}</span>
              </button>
            </form>

            {/* Newly Created Key Alert Box */}
            {newRawKey && (
              <div className="bg-purple-950 text-purple-100 p-4 rounded-xl border border-purple-800 space-y-2 text-xs animate-in fade-in duration-300">
                <span className="font-bold text-amber-400 block text-[11px]">
                  ⚠️ Yeni Üretilen Gizli API Key (Lütfen Kopyalayın):
                </span>
                <div className="flex items-center justify-between font-mono bg-black/60 p-2.5 rounded-lg text-[11px] text-purple-300 break-all border border-purple-800/80">
                  <span className="select-all">{newRawKey}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(newRawKey);
                      setCopiedKey(true);
                      setTimeout(() => setCopiedKey(false), 2000);
                    }}
                    className="p-1.5 text-purple-300 hover:text-white shrink-0 ml-2"
                  >
                    {copiedKey ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Existing API Keys Table (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <h3 className="font-bold text-sm text-ink flex items-center justify-between">
            <span>Kayıtlı API Anahtarları</span>
            <span className="text-xs font-normal text-muted">{apiKeys.length} Anahtar</span>
          </h3>

          <div className="bg-surface border border-border rounded-2xl shadow-2xs overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs min-w-[500px]">
              <thead>
                <tr className="bg-ground border-b border-border text-ink-2 font-bold uppercase tracking-wider text-[11px]">
                  <th className="p-3.5">Anahtar Tanımı</th>
                  <th className="p-3.5">Önek (Prefix)</th>
                  <th className="p-3.5">Son Kullanım</th>
                  <th className="p-3.5 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {apiKeys.map((k) => (
                  <tr key={k.id} className="hover:bg-ground transition-colors">
                    <td className="p-3.5">
                      <span className="font-bold text-ink block">{k.name}</span>
                      <span className="text-[10px] text-muted font-mono">
                        {new Date(k.createdAt).toLocaleDateString('tr-TR')}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono text-ink-2 font-semibold">{k.prefix}...</td>
                    <td className="p-3.5 text-muted font-mono text-[11px]">
                      {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString('tr-TR') : 'Henüz kullanılmadı'}
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => handleRevokeKey(k.id, k.name)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg transition"
                        title="Anahtarı İptal Et"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ──────────────────────── API INTEGRATION & CODE SNIPPETS ──────────────────────── */}
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
          <div>
            <h3 className="font-bold text-base text-ink flex items-center gap-2">
              <Code className="w-5 h-5 text-blue-600" />
              <span>Hızlı Başlangıç & API Entegrasyon Örnekleri</span>
            </h3>
            <p className="text-muted text-xs mt-1">
              Geliştiriciler için cURL, Node.js ve Python ile Partner Intelligence API çağrı şablonları.
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-surface-hover p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setActiveCodeTab('curl')}
              className={`px-3 py-1 rounded-lg transition ${
                activeCodeTab === 'curl' ? 'bg-surface text-ink shadow-2xs' : 'text-ink-2 hover:text-ink'
              }`}
            >
              cURL
            </button>
            <button
              onClick={() => setActiveCodeTab('javascript')}
              className={`px-3 py-1 rounded-lg transition ${
                activeCodeTab === 'javascript' ? 'bg-surface text-ink shadow-2xs' : 'text-ink-2 hover:text-ink'
              }`}
            >
              Node.js / JS
            </button>
            <button
              onClick={() => setActiveCodeTab('python')}
              className={`px-3 py-1 rounded-lg transition ${
                activeCodeTab === 'python' ? 'bg-surface text-ink shadow-2xs' : 'text-ink-2 hover:text-ink'
              }`}
            >
              Python
            </button>
          </div>
        </div>

        {/* Code Snippet Box */}
        <div className="bg-slate-950 text-slate-100 rounded-xl p-4 font-mono text-xs overflow-x-auto leading-relaxed border border-slate-800">
          {activeCodeTab === 'curl' && (
            <pre className="text-slate-200">
{`# 1. CORDIS Ortak Arama (Almanya & Türkiye Araştırma Kuruluşları)
curl -X GET "${apiBaseUrl}/api/v1/partners?country=DE&limit=10" \
  -H "x-api-key: ${sampleKey}"

# 2. Açık Ufuk Avrupa ve TÜBİTAK Çağrılarını Listeleme
curl -X GET "${apiBaseUrl}/api/v1/calls?status=OPEN" \
  -H "Authorization: Bearer ${sampleKey}"

# 3. Kiracı Fırsat Pipeline Sorgulama
curl -X GET "${apiBaseUrl}/api/v1/opportunities" \
  -H "x-api-key: ${sampleKey}"`}
            </pre>
          )}

          {activeCodeTab === 'javascript' && (
            <pre className="text-slate-200">
{`// Partner Intelligence REST API Fetch Client
const API_KEY = '${sampleKey}';

async function fetchPartners() {
  const response = await fetch('${apiBaseUrl}/api/v1/partners?country=TR', {
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json'
    }
  });
  
  const { data } = await response.json();
  console.log('Bulunan Kurumlar:', data);
}

fetchPartners();`}
            </pre>
          )}

          {activeCodeTab === 'python' && (
            <pre className="text-slate-200">
{`# Python requests Client
import requests

API_KEY = "${sampleKey}"
headers = {
    "x-api-key": API_KEY,
    "Content-Type": "application/json"
}

response = requests.get("${apiBaseUrl}/api/v1/partners?limit=5", headers=headers)
if response.status_code == 200:
    partners = response.json().get("data", [])
    for p in partners:
        print(f"{p['name']} ({p['country']}) - PIC: {p['pic']}")`}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
