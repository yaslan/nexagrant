'use client';

import React, { useState } from 'react';
import { 
  Award, 
  Bot, 
  UserCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Sparkles, 
  HelpCircle, 
  Scale, 
  FileCheck, 
  Sliders, 
  Zap, 
  RotateCcw,
  BookOpen,
  Info
} from 'lucide-react';
import { generateAiEvaluation, saveHumanEvaluation, calibrateESR } from '@/modules/m6/server/actions';

interface EvaluationItem {
  id: string;
  readerType: 'AI' | 'HUMAN';
  excellence: number;
  impact: number;
  implementation: number;
  weaknesses?: any;
  calibration?: number | null;
  createdAt?: Date | string;
}

interface EvaluationsClientProps {
  opportunityId: string;
  opportunityTitle: string;
  evaluations: EvaluationItem[];
}

export function EvaluationsClient({
  opportunityId,
  opportunityTitle,
  evaluations: initialEvaluations,
}: EvaluationsClientProps) {
  const [evaluations, setEvaluations] = useState<EvaluationItem[]>(initialEvaluations);
  const [activeTab, setActiveTab] = useState<'evaluations' | 'rea' | 'calibration'>('evaluations');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isInnovationAction, setIsInnovationAction] = useState(false);

  // Human evaluation form state
  const [humanExcellence, setHumanExcellence] = useState('4.0');
  const [humanImpact, setHumanImpact] = useState('4.0');
  const [humanImplementation, setHumanImplementation] = useState('3.8');
  const [humanWeaknesses, setHumanWeaknesses] = useState('');
  const [humanStrengths, setHumanStrengths] = useState('');
  const [isSubmittingHuman, setIsSubmittingHuman] = useState(false);

  // Calibration state
  const [selectedEvalForCalibration, setSelectedEvalForCalibration] = useState<string>(
    evaluations[0]?.id || ''
  );
  const [actualEsrScore, setActualEsrScore] = useState('12.5');
  const [calibrationResult, setCalibrationResult] = useState<number | null>(null);

  // REA Checklist state
  const [reaChecklist, setReaChecklist] = useState<{ [key: string]: boolean }>({
    kpi: true,
    trl: true,
    gender: false,
    dec: true,
    risk: false,
    effort: true,
    openScience: false,
  });

  const handleToggleRea = (key: string) => {
    setReaChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleRunAiEvaluation = async () => {
    setIsAiLoading(true);
    try {
      // The action reads the tenant and user from the session; the browser
      // no longer names either.
      const result = await generateAiEvaluation(opportunityId);
      const newEval: EvaluationItem = {
        id: `ev-ai-${Date.now()}`,
        readerType: 'AI',
        excellence: result.excellence,
        impact: result.impact,
        implementation: result.implementation,
        weaknesses: {
          strengths: result.strengths,
          weaknesses: result.weaknesses,
          recommendations: result.recommendations,
        },
        createdAt: new Date().toISOString(),
      };
      setEvaluations((prev) => [newEval, ...prev]);
    } catch (e) {
      console.error('AI Evaluation error:', e);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSaveHumanEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingHuman(true);
    try {
      const exc = parseFloat(humanExcellence);
      const imp = parseFloat(humanImpact);
      const impl = parseFloat(humanImplementation);
      const weakList = humanWeaknesses.split('\n').filter((s) => s.trim().length > 0);
      const strList = humanStrengths.split('\n').filter((s) => s.trim().length > 0);

      await saveHumanEvaluation({
        opportunityId,
        excellence: exc,
        impact: imp,
        implementation: impl,
        weaknesses: weakList,
        strengths: strList,
      });

      const newEval: EvaluationItem = {
        id: `ev-human-${Date.now()}`,
        readerType: 'HUMAN',
        excellence: exc,
        impact: imp,
        implementation: impl,
        weaknesses: {
          strengths: strList,
          weaknesses: weakList,
        },
        createdAt: new Date().toISOString(),
      };
      setEvaluations((prev) => [newEval, ...prev]);
      setHumanWeaknesses('');
      setHumanStrengths('');
    } catch (err) {
      console.error('Save Human Evaluation error:', err);
    } finally {
      setIsSubmittingHuman(false);
    }
  };

  const handleCalibrate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvalForCalibration) return;

    const actual = parseFloat(actualEsrScore);
    const res = await calibrateESR(selectedEvalForCalibration, actual);

    setCalibrationResult(res.calibration);
    setEvaluations((prev) =>
      prev.map((ev) =>
        ev.id === selectedEvalForCalibration ? { ...ev, calibration: res.calibration } : ev
      )
    );
  };

  // Compute G3 Gate Eligibility
  const humanCount = evaluations.filter((e) => e.readerType === 'HUMAN').length;
  const aiCount = evaluations.filter((e) => e.readerType === 'AI').length;
  const meetsEvaluatorCount = humanCount >= 2 || (humanCount >= 1 && aiCount >= 1);

  const calculateTotal = (e: EvaluationItem) => {
    const impactVal = isInnovationAction ? e.impact * 1.5 : e.impact;
    return e.excellence + impactVal + e.implementation;
  };

  const avgTotalScore =
    evaluations.length > 0
      ? (
          evaluations.reduce((acc, ev) => acc + calculateTotal(ev), 0) / evaluations.length
        ).toFixed(1)
      : '0.0';

  const meetsScoreThreshold = Number(avgTotalScore) >= 12.0;
  const passesG3Gate = meetsEvaluatorCount && meetsScoreThreshold;

  const getScoreColor = (score: number) => {
    if (score >= 4.5) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (score >= 4.0) return 'text-blue-600 bg-blue-50 border-blue-200';
    if (score >= 3.0) return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-rose-600 bg-rose-50 border-rose-200';
  };

  return (
    <div className="space-y-6">
      {/* ──────────────────────── HEADER BANNER ──────────────────────── */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-blue-400 font-semibold tracking-wider uppercase mb-1">
              <Award className="w-4 h-4 text-blue-400" />
              <span>Modül 6 — Evaluator Lens</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight font-heading text-white">
              Resmî EU Ön Değerlendirme & Hakem Simülasyonu
            </h1>
            <p className="text-muted text-xs md:text-sm mt-1 max-w-2xl">
              Fırsat: <strong className="text-slate-200">{opportunityTitle}</strong>
            </p>
          </div>

          {/* Official Disclaimer Badge */}
          <div className="bg-amber-500/15 border border-amber-500/30 text-amber-300 rounded-xl px-4 py-2.5 text-xs flex items-center gap-2.5 shadow-xs shrink-0 max-w-sm">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <span>
              <strong>İç Ön Değerlendirmedir:</strong> Bu puanlar şirket içi kalite kontrol simülasyonudur; resmî Komisyon kararı yerine geçmez.
            </span>
          </div>
        </div>

        {/* Top Metric Cards Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-800 text-xs">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">Ortalama Tahmin Puanı</span>
            <span className="text-xl font-bold text-white font-mono mt-0.5 block">
              {avgTotalScore} <span className="text-xs text-muted">/ 15.0</span>
            </span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">Değerlendirici Sayısı</span>
            <span className="text-xl font-bold text-white font-mono mt-0.5 block">
              {evaluations.length} <span className="text-xs text-muted">({humanCount} İnsan, {aiCount} YZ)</span>
            </span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">G3 Kapısı Durumu</span>
            <span className={`text-sm font-bold font-mono mt-1 flex items-center gap-1.5 ${passesG3Gate ? 'text-emerald-400' : 'text-amber-400'}`}>
              {passesG3Gate ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  G3 Hazır (Geçti)
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Eksik Değerlendirme
                </>
              )}
            </span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <span className="text-muted block text-[11px]">IA Etki Çarpanı (1.5x)</span>
              <span className="text-xs font-bold text-blue-300 mt-0.5 block">
                {isInnovationAction ? 'Aktif (Impact ×1.5)' : 'Pasif (Standart)'}
              </span>
            </div>
            <button
              onClick={() => setIsInnovationAction(!isInnovationAction)}
              className={`p-1.5 rounded-lg border transition ${isInnovationAction ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-700 text-slate-300 border-slate-600'}`}
              title="Innovation Action (IA) için Etki puanına 1.5 katsayısı uygula"
            >
              <Sliders className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ──────────────────────── NAVIGATION TABS ──────────────────────── */}
      <div className="flex border-b border-border gap-2">
        <button
          onClick={() => setActiveTab('evaluations')}
          className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition flex items-center gap-2 border-b-2 -mb-px ${
            activeTab === 'evaluations'
              ? 'border-blue-600 text-blue-600 bg-blue-50/50'
              : 'border-transparent text-muted hover:text-ink hover:bg-ground'
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>Değerlendirmeler & Puan Kartları</span>
          <span className="bg-slate-200 text-ink-2 text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold">
            {evaluations.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('rea')}
          className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition flex items-center gap-2 border-b-2 -mb-px ${
            activeTab === 'rea'
              ? 'border-blue-600 text-blue-600 bg-blue-50/50'
              : 'border-transparent text-muted hover:text-ink hover:bg-ground'
          }`}
        >
          <FileCheck className="w-4 h-4" />
          <span>REA Sık Hatalar Kontrolü</span>
          <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold">
            Checklist
          </span>
        </button>

        <button
          onClick={() => setActiveTab('calibration')}
          className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition flex items-center gap-2 border-b-2 -mb-px ${
            activeTab === 'calibration'
              ? 'border-blue-600 text-blue-600 bg-blue-50/50'
              : 'border-transparent text-muted hover:text-ink hover:bg-ground'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          <span>ESR Kalibrasyonu</span>
        </button>
      </div>

      {/* ──────────────────────── TAB 1: EVALUATIONS & SCORE CARDS ──────────────────────── */}
      {activeTab === 'evaluations' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Actions & Form (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* AI Evaluator Action Box */}
            <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-2xl p-5 shadow-sm border border-indigo-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600/40 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-white">YZ Hakem Simülasyonu</h3>
                    <p className="text-[11px] text-slate-300">Resmî Horizon Europe REA promptu</p>
                  </div>
                </div>
                <span className="text-[11px] font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-700 px-2 py-0.5 rounded-full">
                  3 Kredi
                </span>
              </div>

              <button
                onClick={handleRunAiEvaluation}
                disabled={isAiLoading}
                className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold py-3 px-4 rounded-xl transition shadow-md flex items-center justify-center gap-2 text-xs disabled:opacity-50"
              >
                {isAiLoading ? (
                  <>
                    <Zap className="w-4 h-4 animate-spin" />
                    <span>YZ Değerlendiriyor (Analiz Yapılıyor)...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Yapay Zeka Değerlendirmesi Başlat</span>
                  </>
                )}
              </button>

              <div className="text-[11px] text-muted flex items-center gap-1.5 pt-1">
                <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>Excellence, Impact ve Implementation detaylı tespiti ve zayıf yön analizi üretir.</span>
              </div>
            </div>

            {/* Human Evaluation Form Box */}
            <div className="bg-surface rounded-2xl p-5 border border-border shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b pb-3">
                <UserCheck className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-sm text-ink">İnsan Uzman Değerlendirmesi Ekle</h3>
              </div>

              <form onSubmit={handleSaveHumanEvaluation} className="space-y-3.5 text-xs">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-semibold text-ink-2">1. Excellence / Mükemmeliyet (0 - 5.0)</label>
                    <span className="font-mono font-bold text-blue-600">{humanExcellence} / 5.0</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.1"
                    value={humanExcellence}
                    onChange={(e) => setHumanExcellence(e.target.value)}
                    className="w-full accent-blue-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-semibold text-ink-2">2. Impact / Etki (0 - 5.0)</label>
                    <span className="font-mono font-bold text-blue-600">{humanImpact} / 5.0</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.1"
                    value={humanImpact}
                    onChange={(e) => setHumanImpact(e.target.value)}
                    className="w-full accent-blue-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-semibold text-ink-2">3. Implementation / Uygulama (0 - 5.0)</label>
                    <span className="font-mono font-bold text-blue-600">{humanImplementation} / 5.0</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.1"
                    value={humanImplementation}
                    onChange={(e) => setHumanImplementation(e.target.value)}
                    className="w-full accent-blue-600"
                  />
                </div>

                <div>
                  <label className="font-semibold text-ink-2 block mb-1">Güçlü Yönler (Her satıra bir tane)</label>
                  <textarea
                    rows={2}
                    value={humanStrengths}
                    onChange={(e) => setHumanStrengths(e.target.value)}
                    placeholder="Örn: Net TRL4->TRL7 yol haritası var."
                    className="w-full border border-border rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-semibold text-ink-2 block mb-1">Zayıf Yönler & Eleştiriler (Her satıra bir tane)</label>
                  <textarea
                    rows={2}
                    value={humanWeaknesses}
                    onChange={(e) => setHumanWeaknesses(e.target.value)}
                    placeholder="Örn: WP3 bütçe dağılımı detaylandırılmamış."
                    className="w-full border border-border rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingHuman}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 rounded-xl transition shadow-xs flex items-center justify-center gap-2 text-xs"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>{isSubmittingHuman ? 'Kaydediliyor...' : 'Değerlendirmeyi Kaydet'}</span>
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: Evaluations Feed (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <h3 className="font-bold text-sm text-ink flex items-center justify-between">
              <span>Mevcut Ön Değerlendirme Raporları</span>
              <span className="text-xs font-normal text-muted">
                G3 Kapısı İçin En Az 2 Değerlendirme Önerilir
              </span>
            </h3>

            {evaluations.length === 0 ? (
              <div className="bg-surface border border-border rounded-2xl p-8 text-center text-muted space-y-2">
                <BookOpen className="w-8 h-8 text-muted mx-auto" />
                <p className="font-semibold text-sm">Henüz bir ön değerlendirme bulunmuyor.</p>
                <p className="text-xs">Sol panelden YZ simülasyonu başlatabilir veya uzman görüşü ekleyebilirsiniz.</p>
              </div>
            ) : (
              evaluations.map((ev) => {
                const total = calculateTotal(ev).toFixed(1);
                const isPassed = Number(total) >= 10.0;

                return (
                  <div
                    key={ev.id}
                    className="bg-surface border border-border rounded-2xl p-5 shadow-2xs space-y-4 hover:border-border transition"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-border pb-3">
                      <div className="flex items-center gap-2">
                        {ev.readerType === 'AI' ? (
                          <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                            <Bot className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                            <UserCheck className="w-4 h-4" />
                          </div>
                        )}
                        <div>
                          <span className="font-bold text-xs text-ink block leading-none">
                            {ev.readerType === 'AI' ? 'Yapay Zeka Okuyucusu (EU Standard)' : 'İnsan Uzman Okuyucu'}
                          </span>
                          <span className="text-[10px] text-muted font-mono">
                            {ev.createdAt ? new Date(ev.createdAt).toLocaleDateString('tr-TR') : 'Bugün'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold border ${getScoreColor(Number(total) / 3)}`}>
                          Toplam: {total} / 15.0 {isPassed ? '(Eşik Üstü)' : '(Eşik Altı)'}
                        </span>
                      </div>
                    </div>

                    {/* Breakdown Meters */}
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div className="bg-ground border border-border p-2.5 rounded-xl text-center">
                        <span className="text-[10px] text-muted font-medium block">1. Excellence</span>
                        <span className="font-bold text-sm font-mono text-ink">{ev.excellence.toFixed(1)} / 5.0</span>
                      </div>

                      <div className="bg-ground border border-border p-2.5 rounded-xl text-center">
                        <span className="text-[10px] text-muted font-medium block">
                          2. Impact {isInnovationAction && '(1.5x)'}
                        </span>
                        <span className="font-bold text-sm font-mono text-ink">
                          {(isInnovationAction ? ev.impact * 1.5 : ev.impact).toFixed(1)} / 5.0
                        </span>
                      </div>

                      <div className="bg-ground border border-border p-2.5 rounded-xl text-center">
                        <span className="text-[10px] text-muted font-medium block">3. Implementation</span>
                        <span className="font-bold text-sm font-mono text-ink">{ev.implementation.toFixed(1)} / 5.0</span>
                      </div>
                    </div>

                    {/* Strengths & Weaknesses */}
                    {ev.weaknesses && (
                      <div className="space-y-2 text-xs pt-1">
                        {ev.weaknesses?.strengths?.length > 0 && (
                          <div className="bg-emerald-50/60 border border-emerald-100 p-3 rounded-xl">
                            <span className="font-bold text-emerald-800 flex items-center gap-1 mb-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              Tespit Edilen Güçlü Yönler:
                            </span>
                            <ul className="list-disc pl-4 space-y-0.5 text-emerald-900">
                              {ev.weaknesses.strengths.map((s: string, idx: number) => (
                                <li key={idx}>{s}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {((Array.isArray(ev.weaknesses) && ev.weaknesses.length > 0) || ev.weaknesses?.weaknesses?.length > 0) && (
                          <div className="bg-rose-50/60 border border-rose-100 p-3 rounded-xl">
                            <span className="font-bold text-rose-800 flex items-center gap-1 mb-1">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                              Tespit Edilen Zayıf Yönler & Kritik Eksikler:
                            </span>
                            <ul className="list-disc pl-4 space-y-0.5 text-rose-900">
                              {(Array.isArray(ev.weaknesses) ? ev.weaknesses : ev.weaknesses.weaknesses).map(
                                (w: string, idx: number) => (
                                  <li key={idx}>{w}</li>
                                )
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ──────────────────────── TAB 2: REA CHECKLIST ──────────────────────── */}
      {activeTab === 'rea' && (
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm space-y-6">
          <div>
            <h2 className="text-base font-bold text-ink flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-blue-600" />
              <span>REA (European Research Executive Agency) Sık Hatalar Kontrolü</span>
            </h2>
            <p className="text-muted text-xs mt-1">
              Avrupa Komisyonu hakemlerinin elenme gerekçesi olarak en çok sunduğu 7 kritik tasarım hatasını kontrol edin.
            </p>
          </div>

          <div className="space-y-3">
            {[
              {
                key: 'kpi',
                title: 'Sayısallaştırılmış KPI ve Hedef Metrikler',
                desc: '2.1 bölümünde etki göstergeleri için somut basamaklar verilmiş mi? (Örn: %30 maliyet düşüşü, 500 hasta testi).',
              },
              {
                key: 'trl',
                title: 'TRL Yol Haritası ve Teknoloji Olgunlaşması',
                desc: 'Başlangıç TRL ve bitiş TRL açıkça tanımlanmış ve Work Package faaliyetleriyle desteklenmiş mi?',
              },
              {
                key: 'gender',
                title: 'Cinsiyet Boyutu ve Etik / Açık Bilim (Gender & Open Science)',
                desc: 'Araştırma metodolojisinde cinsiyet boyutu ve veri paylaşım protokolü (FAIR data) belirtilmiş mi?',
              },
              {
                key: 'dec',
                title: 'Yaygınlaştırma & Sömürü Planı (DEC)',
                desc: 'Fikri mülkiyet (IP) koruması, lisanslama ve pazar açılım stratejisi iş paketlerine yedirilmiş mi?',
              },
              {
                key: 'risk',
                title: 'Risk Yönetimi ve Alternatif B Planı',
                desc: 'Kritik milestone aksamaları için "Contingency Measures" (B Planı) matrisi yazılmış mı?',
              },
              {
                key: 'effort',
                title: 'Kişi-Ay (Person-Months) ve Bütçe Dengesi',
                desc: 'İş paketi liderlerinin kişi-ay eforları çıktı ile orantılı mı? (Aşırı veya yetersiz efor yok).',
              },
              {
                key: 'openScience',
                title: 'Açık Bilim ve Veri Yönetimi Planı (DMP)',
                desc: 'Açık erişim yayıncılık ve veri yönetim şeması detaylandırılmış mı?',
              },
            ].map((item) => (
              <div
                key={item.key}
                onClick={() => handleToggleRea(item.key)}
                className={`p-4 rounded-xl border transition cursor-pointer flex items-start gap-3 ${
                  reaChecklist[item.key]
                    ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950'
                    : 'bg-ground border-border text-ink-2 hover:bg-surface-hover/80'
                }`}
              >
                <div
                  className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center shrink-0 border transition ${
                    reaChecklist[item.key]
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-surface border-border'
                  }`}
                >
                  {reaChecklist[item.key] && <CheckCircle2 className="w-3.5 h-3.5" />}
                </div>
                <div>
                  <h4 className="font-bold text-xs">{item.title}</h4>
                  <p className="text-[11px] opacity-80 mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ──────────────────────── TAB 3: ESR CALIBRATION ──────────────────────── */}
      {activeTab === 'calibration' && (
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm space-y-6">
          <div>
            <h2 className="text-base font-bold text-ink flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-blue-600" />
              <span>Resmî ESR (Evaluation Summary Report) Kalibrasyonu</span>
            </h2>
            <p className="text-muted text-xs mt-1">
              Komisyon sonuçları açıklandığında gelen resmî ESR puanını girerek iç YZ/İnsan modelinizin tahmin sapmasını kaydedin.
            </p>
          </div>

          <form onSubmit={handleCalibrate} className="space-y-4 max-w-md">
            <div>
              <label className="text-xs font-semibold text-ink-2 block mb-1">
                Kalibre Edilecek Değerlendirmeyi Seçin
              </label>
              <select
                value={selectedEvalForCalibration}
                onChange={(e) => setSelectedEvalForCalibration(e.target.value)}
                className="w-full border border-border rounded-xl p-2.5 text-xs bg-ground focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {evaluations.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.readerType === 'AI' ? '🤖 YZ Okuyucusu' : '👤 İnsan Okuyucu'} (Puan:{' '}
                    {(ev.excellence + ev.impact + ev.implementation).toFixed(1)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-ink-2 block mb-1">
                Resmî Komisyon ESR Toplam Puanı (0 - 15.0)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="15"
                value={actualEsrScore}
                onChange={(e) => setActualEsrScore(e.target.value)}
                className="w-full border border-border rounded-xl p-2.5 text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-6 rounded-xl transition text-xs shadow-sm flex items-center gap-2"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Kalibrasyon Hesapla ve Kaydet</span>
            </button>
          </form>

          {calibrationResult !== null && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs space-y-1">
              <span className="font-bold text-blue-900 block">Hesaplanan Kalibrasyon Sapması (Variance):</span>
              <p className="text-blue-800 font-mono text-sm">
                Sapma: <strong>{calibrationResult > 0 ? `+${calibrationResult}` : calibrationResult}</strong> puan
              </p>
              <p className="text-[11px] text-blue-700">
                {Math.abs(calibrationResult) <= 0.5
                  ? '🎯 Harika! İç değerlendirme modeliniz resmî ESR puanına çok yakın (≤ 0.5 puan sapma).'
                  : '⚠️ Modeliniz resmî puandan biraz sapma gösteriyor. Gelecek projelerde kalibrasyon katsayısı güncellenecektir.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
