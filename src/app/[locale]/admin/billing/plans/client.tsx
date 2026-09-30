'use client';

import React, { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  Layers,
  Plus,
  Trash2,
  Archive,
  Send,
  AlertTriangle,
  History,
  Lock,
  Globe,
  Users,
  X,
  Save,
} from 'lucide-react';
import { formatMoney } from '@/lib/money';
import { isContractPlan } from '@/lib/billing/catalog';
import type { AdminPlanRow, AdminPlanVersionRow, PublishImpact } from '@/lib/billing/plan-repository';
import {
  createDraftAction,
  saveDraftAction,
  discardDraftAction,
  previewImpactAction,
  publishVersionAction,
  setVisibilityAction,
  archivePlanAction,
  deletePlanAction,
  assignPlanAction,
  unassignPlanAction,
  type ActionResult,
} from './actions';

interface FeatureDraft {
  order: number;
  kind: 'module' | 'limit' | 'text';
  moduleId: string;
  limitKey: string;
  textTr: string;
  textEn: string;
}

interface PlanAdminClientProps {
  locale: string;
  plans: AdminPlanRow[];
  modules: Array<{ id: string; name: string }>;
  tenants: Array<{ id: string; name: string }>;
  loadError: string | null;
}

const VISIBILITIES = ['public', 'private', 'archived'] as const;

export function PlanAdminClient({ locale, plans, modules, tenants, loadError }: PlanAdminClientProps) {
  const t = useTranslations('adminPlans');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [selectedPlanId, setSelectedPlanId] = useState<string>(plans[0]?.id ?? '');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // The publish gate. `null` means "the operator has not been shown the blast
  // radius yet", and the publish button is inert until it is a number. The
  // server re-measures and refuses a mismatch, so this is a courtesy, not the
  // guarantee.
  const [impact, setImpact] = useState<PublishImpact | null>(null);
  const [impactForVersion, setImpactForVersion] = useState<string | null>(null);

  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({
    monthlyCents: 0,
    yearlyCents: 0,
    currency: 'USD',
    seats: 1,
    workspaces: 1,
    aiCreditsMonthly: 0,
    modules: [] as string[],
  });
  const [features, setFeatures] = useState<FeatureDraft[]>([]);
  const [assignTenantId, setAssignTenantId] = useState('');
  const [assignNote, setAssignNote] = useState('');

  const plan = useMemo(() => plans.find((p) => p.id === selectedPlanId) ?? null, [plans, selectedPlanId]);
  const draft = plan?.versions.find((v) => v.status === 'draft') ?? null;
  const published = plan?.versions.find((v) => v.status === 'published') ?? null;
  const moduleName = (id: string) => modules.find((m) => m.id === id)?.name ?? id;

  const money = (minor: number, currency: string) => formatMoney(minor, currency, locale);

  /** Run a server action and surface its `code` as a translated sentence. */
  const run = <T,>(fn: () => Promise<ActionResult<T>>, onOk?: (data: T) => void) => {
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        onOk?.(res.data as T);
        setNotice({ kind: 'ok', text: t('saved') });
        router.refresh();
      } else {
        setNotice({ kind: 'err', text: t(`errors.${res.code}`, { detail: res.detail }) });
      }
    });
  };

  /** Load a version's real body into the editor. Never leave the form at its
   *  initial zeros: whatever is on screen is what "save" writes. */
  const seedEditor = (v: AdminPlanVersionRow) => {
    setEditing(v.id);
    setImpact(null);
    setImpactForVersion(null);
    setForm({
      monthlyCents: v.monthlyCents,
      yearlyCents: v.yearlyCents,
      currency: v.currency,
      seats: v.seats,
      workspaces: v.workspaces,
      aiCreditsMonthly: v.aiCreditsMonthly,
      modules: [...v.modules],
    });
    setFeatures(
      v.features.map((f) => ({
        order: f.order,
        kind: (f.kind as FeatureDraft['kind']) ?? 'text',
        moduleId: f.moduleId ?? '',
        limitKey: f.limitKey ?? '',
        textTr: f.textTr ?? '',
        textEn: f.textEn ?? '',
      }))
    );
  };

  /** Editing an existing draft row from the history table. */
  const openEditor = (versionId: string) => {
    const v = plan?.versions.find((x) => x.id === versionId);
    if (v) seedEditor(v);
  };

  const toggleModule = (id: string) => {
    setForm((f) => {
      const has = f.modules.includes(id);
      const next = has ? f.modules.filter((m) => m !== id) : [...f.modules, id];
      // Dropping a module must drop the card bullet that promised it, or the
      // pricing card would keep advertising something the plan no longer grants.
      if (has) setFeatures((rows) => rows.filter((r) => !(r.kind === 'module' && r.moduleId === id)));
      return { ...f, modules: next };
    });
    setImpact(null);
  };

  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto bg-surface border border-rose-300 rounded-xl p-4 sm:p-6 space-y-2">
        <h1 className="text-lg font-bold text-ink flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-rose-600" /> {t('title')}
        </h1>
        <p className="text-sm text-rose-700" data-testid="plans-load-error">
          {t('loadError')}
        </p>
        <p className="text-xs font-mono text-muted">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6" data-testid="plan-admin">
      <header className="bg-surface p-5 rounded-xl border shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-ink flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600" /> {t('title')}
          </h1>
          <p className="text-xs sm:text-sm text-muted">{t('subtitle')}</p>
        </div>
        <span className="text-xs font-mono bg-ground border border-border rounded-lg px-3 py-1.5 text-ink-2">
          {t('planCount', { count: plans.length })}
        </span>
      </header>

      {notice && (
        <div
          data-testid="plan-notice"
          className={`rounded-lg border px-4 py-2.5 text-sm ${
            notice.kind === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* ── plan list ── */}
        <nav className="bg-surface border rounded-xl p-3 space-y-1.5 h-fit" aria-label={t('planListLabel')}>
          {plans.map((p) => (
            <button
              key={p.id}
              type="button"
              data-testid={`plan-row-${p.id}`}
              onClick={() => {
                setSelectedPlanId(p.id);
                setEditing(null);
                setImpact(null);
                setNotice(null);
              }}
              className={`w-full text-left px-3 py-2.5 rounded-lg border transition ${
                p.id === selectedPlanId
                  ? 'bg-indigo-50 border-indigo-300'
                  : 'bg-ground border-transparent hover:border-border'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm text-ink">{p.name}</span>
                {p.visibility === 'private' ? (
                  <Lock className="w-3.5 h-3.5 text-amber-600" aria-label={t('visibility.private')} />
                ) : p.visibility === 'archived' ? (
                  <Archive className="w-3.5 h-3.5 text-muted" aria-label={t('visibility.archived')} />
                ) : (
                  <Globe className="w-3.5 h-3.5 text-emerald-600" aria-label={t('visibility.public')} />
                )}
              </span>
              <span className="block text-[11px] text-muted font-mono">
                {p.id} · {t('liveTenants', { count: p.liveSubscriptions })}
              </span>
            </button>
          ))}
        </nav>

        {/* ── selected plan ── */}
        {plan && (
          <section className="space-y-5">
            <div className="bg-surface border rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-ink" data-testid="plan-heading">
                  {plan.name}
                </h2>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted" htmlFor="visibility-select">
                    {t('visibility.label')}
                  </label>
                  <select
                    id="visibility-select"
                    data-testid="visibility-select"
                    className="text-sm border border-border rounded-lg px-2 py-1.5 bg-ground text-ink"
                    value={plan.visibility}
                    disabled={pending}
                    onChange={(e) =>
                      run(() =>
                        setVisibilityAction(plan.id, e.target.value as (typeof VISIBILITIES)[number])
                      )
                    }
                  >
                    {VISIBILITIES.map((v) => (
                      <option key={v} value={v}>
                        {t(`visibility.${v}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* ── version history ── */}
              <div>
                <h3 className="text-sm font-semibold text-ink-2 flex items-center gap-1.5 mb-2">
                  <History className="w-4 h-4" /> {t('history.title')}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm min-w-[560px]" data-testid="version-history">
                    <thead>
                      <tr className="bg-ground text-ink-2 text-xs">
                        <th className="p-2.5">{t('history.version')}</th>
                        <th className="p-2.5">{t('history.status')}</th>
                        <th className="p-2.5">{t('history.monthly')}</th>
                        <th className="p-2.5">{t('history.limits')}</th>
                        <th className="p-2.5">{t('history.publishedAt')}</th>
                        <th className="p-2.5 text-right">{t('history.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.versions.map((v) => (
                        <tr key={v.id} className="border-t border-border" data-testid={`version-row-${v.version}`}>
                          <td className="p-2.5 font-mono font-semibold">v{v.version}</td>
                          <td className="p-2.5">
                            <span
                              data-testid={`version-status-${v.version}`}
                              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                v.status === 'published'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : v.status === 'draft'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {t(`status.${v.status}`)}
                            </span>
                          </td>
                          <td className="p-2.5 font-mono">{money(v.monthlyCents, v.currency)}</td>
                          <td className="p-2.5 text-xs text-muted font-mono">
                            {v.seats}/{v.workspaces}/{v.aiCreditsMonthly}
                          </td>
                          <td className="p-2.5 text-xs text-muted">
                            {v.publishedAt ? new Date(v.publishedAt).toLocaleDateString(locale) : '—'}
                          </td>
                          <td className="p-2.5 text-right">
                            {v.status === 'draft' ? (
                              <button
                                type="button"
                                data-testid={`edit-draft-${v.version}`}
                                className="text-xs font-semibold text-indigo-700 hover:underline"
                                onClick={() => openEditor(v.id)}
                              >
                                {t('editDraft')}
                              </button>
                            ) : (
                              <span
                                className="text-[11px] text-muted"
                                data-testid={`immutable-note-${v.version}`}
                                title={t('immutableHint')}
                              >
                                {t('immutable')}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  data-testid="create-draft"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => createDraftAction(plan.id),
                      // Seed the form from the row the server actually created,
                      // not from an empty default.
                      (row) => seedEditor(row)
                    )
                  }
                  className="inline-flex items-center gap-1.5 text-sm font-semibold bg-indigo-600 text-white px-3.5 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" /> {draft ? t('openDraft') : t('createDraft')}
                </button>

                <button
                  type="button"
                  data-testid="archive-plan"
                  disabled={pending}
                  onClick={() => run(() => archivePlanAction(plan.id))}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold border border-border px-3.5 py-2 rounded-lg text-ink hover:bg-ground disabled:opacity-50"
                >
                  <Archive className="w-4 h-4" /> {t('archivePlan')}
                </button>

                {/* A plan somebody pays for is archived, never deleted: deleting
                    it would orphan the subscription and erase the terms it was
                    sold under. The server refuses it too. */}
                <button
                  type="button"
                  data-testid="delete-plan"
                  disabled={pending || plan.liveSubscriptions > 0}
                  title={plan.liveSubscriptions > 0 ? t('deleteBlocked', { count: plan.liveSubscriptions }) : ''}
                  onClick={() => run(() => deletePlanAction(plan.id))}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold border border-rose-300 text-rose-700 px-3.5 py-2 rounded-lg hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4" /> {t('deletePlan')}
                </button>
                {plan.liveSubscriptions > 0 && (
                  <span className="text-xs text-amber-800 self-center" data-testid="delete-blocked-note">
                    {t('deleteBlocked', { count: plan.liveSubscriptions })}
                  </span>
                )}
              </div>
            </div>

            {/* ── draft editor ── */}
            {editing && draft && editing === draft.id && (
              <div className="bg-surface border border-indigo-200 rounded-xl p-5 space-y-4" data-testid="draft-editor">
                <h3 className="text-sm font-bold text-ink">{t('editor.title', { version: draft.version })}</h3>
                <p className="text-xs text-muted">{t('editor.hint')}</p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {(
                    [
                      ['monthlyCents', t('editor.monthlyCents')],
                      ['yearlyCents', t('editor.yearlyCents')],
                      ['seats', t('editor.seats')],
                      ['workspaces', t('editor.workspaces')],
                      ['aiCreditsMonthly', t('editor.credits')],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="text-xs text-ink-2 space-y-1">
                      <span>{label}</span>
                      <input
                        type="number"
                        data-testid={`field-${key}`}
                        className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-ground text-ink"
                        value={form[key]}
                        onChange={(e) => {
                          setForm((f) => ({ ...f, [key]: Number(e.target.value) }));
                          setImpact(null);
                        }}
                      />
                    </label>
                  ))}
                  <label className="text-xs text-ink-2 space-y-1">
                    <span>{t('editor.currency')}</span>
                    <input
                      data-testid="field-currency"
                      className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-ground text-ink"
                      value={form.currency}
                      onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                    />
                  </label>
                </div>

                <fieldset className="space-y-2">
                  <legend className="text-xs font-semibold text-ink-2">{t('editor.modules')}</legend>
                  <div className="flex flex-wrap gap-2">
                    {modules.map((m) => (
                      <label
                        key={m.id}
                        className={`text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer ${
                          form.modules.includes(m.id)
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                            : 'bg-ground border-border text-ink-2'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mr-1.5 align-middle"
                          data-testid={`module-${m.id}`}
                          checked={form.modules.includes(m.id)}
                          onChange={() => toggleModule(m.id)}
                        />
                        <span className="font-mono">{m.id}</span> · {m.name}
                      </label>
                    ))}
                  </div>
                </fieldset>

                {/* ── card bullets ── */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-ink-2">{t('editor.features')}</h4>
                    <button
                      type="button"
                      data-testid="add-feature"
                      className="text-xs font-semibold text-indigo-700 hover:underline"
                      onClick={() =>
                        setFeatures((rows) => [
                          ...rows,
                          {
                            order: rows.length + 1,
                            kind: 'text',
                            moduleId: '',
                            limitKey: '',
                            textTr: '',
                            textEn: '',
                          },
                        ])
                      }
                    >
                      + {t('editor.addFeature')}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted">{t('editor.featureGrantHint')}</p>

                  {features.map((f, i) => (
                    <div
                      key={i}
                      data-testid={`feature-row-${i}`}
                      className="grid grid-cols-1 sm:grid-cols-[110px_1fr_1fr_28px] gap-2 items-start bg-ground border border-border rounded-lg p-2"
                    >
                      <select
                        data-testid={`feature-kind-${i}`}
                        className="text-xs border border-border rounded px-2 py-1.5 bg-surface text-ink"
                        value={f.kind}
                        onChange={(e) =>
                          setFeatures((rows) =>
                            rows.map((r, j) =>
                              j === i ? { ...r, kind: e.target.value as FeatureDraft['kind'] } : r
                            )
                          )
                        }
                      >
                        <option value="module">{t('editor.kindModule')}</option>
                        <option value="limit">{t('editor.kindLimit')}</option>
                        <option value="text">{t('editor.kindText')}</option>
                      </select>

                      {f.kind === 'module' ? (
                        // Only modules this version grants. The repository
                        // refuses the rest anyway; the picker never offers them.
                        <select
                          data-testid={`feature-module-${i}`}
                          className="text-xs border border-border rounded px-2 py-1.5 bg-surface text-ink"
                          value={f.moduleId}
                          onChange={(e) =>
                            setFeatures((rows) =>
                              rows.map((r, j) => (j === i ? { ...r, moduleId: e.target.value } : r))
                            )
                          }
                        >
                          <option value="">{t('editor.pickModule')}</option>
                          {form.modules.map((id) => (
                            <option key={id} value={id}>
                              {id} · {moduleName(id)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          data-testid={`feature-tr-${i}`}
                          placeholder={t('editor.textTr')}
                          className="text-xs border border-border rounded px-2 py-1.5 bg-surface text-ink"
                          value={f.kind === 'limit' ? f.limitKey : f.textTr}
                          onChange={(e) =>
                            setFeatures((rows) =>
                              rows.map((r, j) =>
                                j === i
                                  ? f.kind === 'limit'
                                    ? { ...r, limitKey: e.target.value }
                                    : { ...r, textTr: e.target.value }
                                  : r
                              )
                            )
                          }
                        />
                      )}

                      <input
                        data-testid={`feature-en-${i}`}
                        placeholder={t('editor.textEn')}
                        className="text-xs border border-border rounded px-2 py-1.5 bg-surface text-ink"
                        value={f.textEn}
                        onChange={(e) =>
                          setFeatures((rows) =>
                            rows.map((r, j) => (j === i ? { ...r, textEn: e.target.value } : r))
                          )
                        }
                      />

                      <button
                        type="button"
                        aria-label={t('editor.removeFeature')}
                        data-testid={`remove-feature-${i}`}
                        className="text-muted hover:text-rose-600 justify-self-end"
                        onClick={() => setFeatures((rows) => rows.filter((_, j) => j !== i))}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    data-testid="save-draft"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        saveDraftAction(
                          draft.id,
                          form,
                          features.map((f, i) => ({
                            order: i + 1,
                            kind: f.kind,
                            moduleId: f.moduleId || null,
                            limitKey: f.limitKey || null,
                            textTr: f.textTr || null,
                            textEn: f.textEn || null,
                          }))
                        )
                      )
                    }
                    className="inline-flex items-center gap-1.5 text-sm font-semibold bg-slate-800 text-white px-3.5 py-2 rounded-lg hover:bg-slate-900 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" /> {t('editor.save')}
                  </button>

                  <button
                    type="button"
                    data-testid="check-impact"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => previewImpactAction(draft.id),
                        (data) => {
                          setImpact(data);
                          setImpactForVersion(draft.id);
                        }
                      )
                    }
                    className="inline-flex items-center gap-1.5 text-sm font-semibold border border-amber-300 text-amber-800 bg-amber-50 px-3.5 py-2 rounded-lg hover:bg-amber-100 disabled:opacity-50"
                  >
                    <AlertTriangle className="w-4 h-4" /> {t('editor.checkImpact')}
                  </button>

                  <button
                    type="button"
                    data-testid="discard-draft"
                    disabled={pending}
                    onClick={() =>
                      run(() => discardDraftAction(draft.id), () => setEditing(null))
                    }
                    className="inline-flex items-center gap-1.5 text-sm font-semibold border border-border text-ink px-3.5 py-2 rounded-lg hover:bg-ground disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" /> {t('editor.discard')}
                  </button>
                </div>

                {/* The mandatory pre-publish warning. Until it has been fetched
                    for *this* draft, publishing is not offered at all. */}
                {impact && impactForVersion === draft.id ? (
                  <div
                    data-testid="impact-panel"
                    className={`rounded-lg border p-4 space-y-2 ${
                      impact.lowered.length > 0
                        ? 'bg-amber-50 border-amber-300'
                        : 'bg-emerald-50 border-emerald-200'
                    }`}
                  >
                    <p className="text-sm font-semibold text-ink" data-testid="impact-count">
                      {impact.loweredTenantCount > 0
                        ? t('impact.lowers', { count: impact.loweredTenantCount })
                        : impact.lowered.length > 0
                          ? // The version *does* shrink; there is simply nobody
                            // on it yet. Saying "nothing is lowered" here would
                            // contradict the two lines directly underneath.
                            t('impact.loweredNoTenants')
                          : t('impact.none', { count: impact.liveTenantCount })}
                    </p>
                    {impact.lowered.length > 0 && (
                      <p className="text-xs text-amber-900" data-testid="impact-dimensions">
                        {t('impact.dimensions', {
                          list: impact.lowered.map((d) => t(`impact.dim.${d}`)).join(', '),
                        })}
                      </p>
                    )}
                    {impact.removedModules.length > 0 && (
                      <p className="text-xs text-amber-900" data-testid="impact-removed-modules">
                        {t('impact.removedModules', { list: impact.removedModules.join(', ') })}
                      </p>
                    )}
                    <button
                      type="button"
                      data-testid="publish-version"
                      disabled={pending}
                      onClick={() =>
                        run(() => publishVersionAction(draft.id, impact.loweredTenantCount), () => {
                          setEditing(null);
                          setImpact(null);
                        })
                      }
                      className="inline-flex items-center gap-1.5 text-sm font-semibold bg-emerald-600 text-white px-3.5 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" /> {t('editor.publish')}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-muted" data-testid="publish-locked">
                    {t('impact.mustCheck')}
                  </p>
                )}
              </div>
            )}

            {/* ── private plan assignment ── */}
            {plan.visibility === 'private' && (
              <div className="bg-surface border rounded-xl p-5 space-y-3" data-testid="assignment-panel">
                <h3 className="text-sm font-bold text-ink flex items-center gap-1.5">
                  <Users className="w-4 h-4" /> {t('assign.title')}
                </h3>
                <p className="text-xs text-muted">{t('assign.hint')}</p>
                {isContractPlan(plan.id) && (
                  <p className="text-xs text-ink-2" data-testid="assign-contract-hint">
                    {t('assign.contractHint')}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 items-end">
                  <label className="text-xs text-ink-2 space-y-1">
                    <span className="block">{t('assign.tenant')}</span>
                    <select
                      data-testid="assign-tenant"
                      className="border border-border rounded-lg px-2.5 py-1.5 text-sm bg-ground text-ink min-w-[200px]"
                      value={assignTenantId}
                      onChange={(e) => setAssignTenantId(e.target.value)}
                    >
                      <option value="">{t('assign.pickTenant')}</option>
                      {tenants.map((tn) => (
                        <option key={tn.id} value={tn.id}>
                          {tn.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-ink-2 space-y-1 flex-1 min-w-[180px]">
                    <span className="block">{t('assign.note')}</span>
                    <input
                      data-testid="assign-note"
                      className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-ground text-ink"
                      value={assignNote}
                      onChange={(e) => setAssignNote(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    data-testid="assign-submit"
                    disabled={pending || !assignTenantId}
                    onClick={() =>
                      run(() => assignPlanAction(plan.id, assignTenantId, assignNote), () => {
                        setAssignTenantId('');
                        setAssignNote('');
                      })
                    }
                    className="text-sm font-semibold bg-indigo-600 text-white px-3.5 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {t('assign.submit')}
                  </button>
                </div>

                <ul className="divide-y divide-border border border-border rounded-lg" data-testid="assignment-list">
                  {plan.assignments.length === 0 && (
                    <li className="p-3 text-xs text-muted" data-testid="assignment-empty">
                      {t('assign.empty')}
                    </li>
                  )}
                  {plan.assignments.map((a) => (
                    <li
                      key={a.id}
                      data-testid={`assignment-${a.tenantId}`}
                      className="p-3 flex items-center justify-between gap-3 text-sm"
                    >
                      <span>
                        <span className="font-semibold text-ink">{a.tenantName}</span>
                        {a.note && <span className="text-xs text-muted"> — {a.note}</span>}
                      </span>
                      <button
                        type="button"
                        data-testid={`unassign-${a.tenantId}`}
                        disabled={pending}
                        onClick={() => run(() => unassignPlanAction(plan.id, a.tenantId))}
                        className="text-xs font-semibold text-rose-700 hover:underline disabled:opacity-50"
                      >
                        {t('assign.remove')}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {published && (
              <p className="text-[11px] text-muted" data-testid="published-summary">
                {t('publishedSummary', {
                  version: published.version,
                  modules: published.modules.join(', ') || '—',
                })}
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
