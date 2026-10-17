'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { EXPERTISE_AREAS, LANGUAGES, PROGRAMMES, ROLES } from '@/lib/expert-prereg/options';
import {
  EXPERT_PREREG_ERROR_CODES,
  expertPreRegInputSchema,
  type ExpertPreRegErrorCode,
  type ExpertPreRegInput,
} from '@/lib/expert-prereg/schema';
import ChoiceGroup from './ChoiceGroup';
import KvkkDialog from './KvkkDialog';
import ProvinceCombobox from './ProvinceCombobox';
import type { KvkkBlock } from './kvkk-text';
import { focusRing, inputClass } from './styles';

interface ExpertPreregFormProps {
  locale: 'tr' | 'en';
  kvkkBlocks: KvkkBlock[];
  /** Absolute URL of this page, for the LinkedIn share text. */
  pageUrl: string;
  /** Lifetime of the verification link, from the server's VERIFY_TOKEN_TTL_MS. */
  verifyHours: number;
}

type Field = Exclude<keyof ExpertPreRegInput, 'utmSource' | 'utmMedium' | 'utmCampaign' | 'locale'>;
type FieldErrors = Partial<Record<Field, ExpertPreRegErrorCode>>;

/**
 * Every schema field, top-to-bottom as the form shows them (key order): the first
 * error in this order gets focus. Keyed by Field, so a field added to the schema
 * without a place here fails tsc instead of being dropped by toFieldErrors (FO-25).
 */
const FIELDS = {
  fullName: true,
  email: true,
  province: true,
  title: true,
  organization: true,
  isFreelancer: true,
  expertiseAreas: true,
  roles: true,
  programmes: true,
  languages: true,
  projectCodes: true,
  orcid: true,
  linkedinUrl: true,
  referredBy: true,
  kvkkAccepted: true,
  visibilityConsent: true,
  marketingConsent: true,
} satisfies Record<Field, true>;

const FIELD_ORDER = Object.keys(FIELDS) as Field[];

const UTM_KEYS = { utm_source: 'utmSource', utm_medium: 'utmMedium', utm_campaign: 'utmCampaign' } as const;
const noSubscribe = () => () => {};

const isField = (k: unknown): k is Field => typeof k === 'string' && (FIELD_ORDER as readonly string[]).includes(k);
const isCode = (c: unknown): c is ExpertPreRegErrorCode =>
  typeof c === 'string' && (EXPERT_PREREG_ERROR_CODES as readonly string[]).includes(c);

/** `{ field: code }` from an API body or zod issues; unknown fields/codes are dropped. */
function toFieldErrors(entries: Iterable<[unknown, unknown]>): FieldErrors {
  const out: FieldErrors = {};
  for (const [field, code] of entries) {
    if (isField(field) && !out[field]) out[field] = isCode(code) ? code : 'invalid';
  }
  return out;
}

/** 0000-0000-0000-000X as the user types; only digits (and a final X) survive. */
export function maskOrcid(raw: string): string {
  const chars = raw.toUpperCase().replace(/[^\dX]/g, '');
  let body = '';
  for (let i = 0; i < chars.length && body.length < 16; i++) {
    const c = chars.charAt(i);
    if (c === 'X' && body.length !== 15) continue;
    body += c;
  }
  return body.replace(/(.{4})(?=.)/g, '$1-');
}

/**
 * FO-20 — the public expert pre-registration form. Validation is the shared zod
 * schema from FO-19 (src/lib/expert-prereg/schema.ts); the server repeats it and
 * answers with the same error codes, which this form translates (kural 8).
 */
export default function ExpertPreregForm({ locale, kvkkBlocks, pageUrl, verifyHours }: ExpertPreregFormProps) {
  const t = useTranslations('ExpertPrereg');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [province, setProvince] = useState('');
  const [title, setTitle] = useState('');
  const [organization, setOrganization] = useState('');
  const [isFreelancer, setIsFreelancer] = useState(false);
  const [areas, setAreas] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [programmes, setProgrammes] = useState<string[]>([]);
  const [projectCodes, setProjectCodes] = useState('');
  const [orcid, setOrcid] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [languages, setLanguages] = useState<string[]>([]);
  const [referredBy, setReferredBy] = useState('');
  const [kvkkAccepted, setKvkkAccepted] = useState(false);
  const [visibilityConsent, setVisibilityConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);
  const kvkkRef = useRef<HTMLDialogElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const utmRef = useRef<Partial<Record<(typeof UTM_KEYS)[keyof typeof UTM_KEYS], string>>>({});
  // Server-rendered without an action: a click before hydration would be a
  // native GET that puts the e-mail in the URL. Disabled until onSubmit is live.
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );

  // Campaign source of the visit, captured once on arrival.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    for (const [param, key] of Object.entries(UTM_KEYS)) {
      const v = params.get(param);
      if (v) utmRef.current[key] = v.slice(0, 100);
    }
  }, []);

  useEffect(() => {
    if (sentTo) successRef.current?.focus();
  }, [sentTo]);

  const clear = (field: Field) => setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));

  function focusFirst(next: FieldErrors) {
    const first = FIELD_ORDER.find((f) => next[f]);
    if (!first) return;
    const el = document.getElementById(`ep-${first}`) ?? document.getElementById(first);
    const target = el instanceof HTMLFieldSetElement ? el.querySelector<HTMLElement>('input') : el;
    target?.focus();
  }

  function showErrors(next: FieldErrors) {
    setErrors(next);
    focusFirst(next);
  }

  /** Unchecked consent boxes go as `false`; the schema turns that into consent_required. */
  function payload() {
    return {
      fullName,
      email,
      province,
      title,
      organization,
      isFreelancer,
      expertiseAreas: areas,
      roles,
      programmes,
      projectCodes,
      orcid,
      linkedinUrl,
      languages,
      referredBy,
      ...utmRef.current,
      kvkkAccepted,
      visibilityConsent,
      marketingConsent,
      locale,
    };
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending) return;
    setFormError(null);
    const body = payload();
    const parsed = expertPreRegInputSchema.safeParse(body);
    if (!parsed.success) {
      const found = toFieldErrors(parsed.error.issues.map((i) => [i.path[0], i.message]));
      // The schema says too_short for an empty name; to the person it is simply missing.
      if (found.fullName === 'too_short' && fullName.trim() === '') found.fullName = 'required';
      showErrors(found);
      return;
    }
    setErrors({});
    setSending(true);
    let res: Response | null = null;
    try {
      res = await fetch('/api/expert-preregistration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, website: honeypotRef.current?.value ?? '' }),
      });
    } catch {
      res = null;
    }
    setSending(false);

    if (res?.ok) {
      setSentTo(parsed.data.email);
      return;
    }
    if (res && (res.status === 400 || res.status === 409)) {
      const data: unknown = await res.json().catch(() => null);
      const raw = data && typeof data === 'object' && 'errors' in data ? data.errors : null;
      const next = raw && typeof raw === 'object' ? toFieldErrors(Object.entries(raw)) : {};
      if (Object.keys(next).length > 0) {
        showErrors(next);
        return;
      }
    }
    setFormError(res?.status === 429 ? t('form.error_rate') : t('form.error_server'));
  }

  if (sentTo) {
    const shareText = t('success.share_text', { url: pageUrl });
    const shareHref = `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(shareText)}`;
    return (
      <section aria-labelledby="ep-success" className="rounded-xl border border-ok bg-surface p-5 sm:p-6">
        <h2 id="ep-success" ref={successRef} tabIndex={-1} className="font-heading text-2xl font-semibold text-ink outline-none">
          {t('success.title')}
        </h2>
        <p role="status" className="mt-2 rounded-lg border border-amber bg-surface px-3 py-2 text-sm font-medium text-ink">
          {t('success.verify', { email: sentTo, hours: verifyHours })}
        </p>
        <a
          href={shareHref}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="ep-share-linkedin"
          className={`mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-accent-strong px-5 text-sm font-semibold text-white hover:opacity-90 ${focusRing}`}
        >
          {t('success.share')}
          <span className="sr-only"> {t('success.share_new_tab')}</span>
        </a>
      </section>
    );
  }

  const err = (field: Field) => (errors[field] ? t(`errors.${errors[field]}`) : undefined);
  const describedBy = (field: Field, hint?: boolean) =>
    [hint ? `ep-${field}-hint` : null, errors[field] ? `ep-${field}-error` : null].filter(Boolean).join(' ') || undefined;
  const fieldError = (field: Field) =>
    errors[field] ? (
      <p id={`ep-${field}-error`} className="mt-1 text-sm font-medium text-bad">
        {err(field)}
      </p>
    ) : null;
  const border = (field: Field) => (errors[field] ? 'border-bad' : 'border-border');
  const requiredMark = (
    <>
      <span className="text-bad" aria-hidden="true">
        {' *'}
      </span>
      <span className="sr-only"> {t('form.required_mark_sr')}</span>
    </>
  );
  const labelClass = 'block text-sm font-medium text-ink';
  const hintClass = 'text-xs text-ink-2';

  const textField = (
    field: 'fullName' | 'email' | 'title' | 'organization' | 'projectCodes' | 'linkedinUrl' | 'referredBy',
    value: string,
    set: (v: string) => void,
    opts: {
      required?: boolean;
      type?: string;
      autoComplete?: string;
      inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
      placeholder?: string;
      hint?: string;
      maxLength: number;
    },
  ) => (
    <div>
      <label htmlFor={`ep-${field}`} className={labelClass}>
        {t(`form.${field}_label`)}
        {opts.required ? requiredMark : null}
      </label>
      {opts.hint ? (
        <p id={`ep-${field}-hint`} className={hintClass}>
          {opts.hint}
        </p>
      ) : null}
      <input
        id={`ep-${field}`}
        name={field}
        type={opts.type ?? 'text'}
        inputMode={opts.inputMode}
        autoComplete={opts.autoComplete}
        placeholder={opts.placeholder}
        maxLength={opts.maxLength}
        aria-required={opts.required || undefined}
        aria-invalid={errors[field] ? true : undefined}
        aria-describedby={describedBy(field, Boolean(opts.hint))}
        value={value}
        onChange={(e) => {
          set(e.target.value);
          clear(field);
        }}
        className={`${inputClass} ${border(field)}`}
      />
      {fieldError(field)}
    </div>
  );

  const consentBox = (
    field: 'kvkkAccepted' | 'visibilityConsent' | 'marketingConsent',
    checked: boolean,
    set: (v: boolean) => void,
    label: React.ReactNode,
    required: boolean,
  ) => (
    <div>
      <div className="flex items-start gap-3">
        <input
          id={`ep-${field}`}
          name={field}
          type="checkbox"
          checked={checked}
          aria-required={required || undefined}
          aria-invalid={errors[field] ? true : undefined}
          aria-describedby={describedBy(field)}
          onChange={(e) => {
            set(e.target.checked);
            clear(field);
          }}
          className={`mt-0.5 h-6 w-6 shrink-0 accent-[var(--accent-strong)] ${focusRing}`}
        />
        <label htmlFor={`ep-${field}`} className="text-sm leading-relaxed text-ink">
          {label}
          {required ? requiredMark : null}
        </label>
      </div>
      <div className="pl-9">{fieldError(field)}</div>
    </div>
  );

  const errorCount = Object.values(errors).filter(Boolean).length;
  const opts = (group: 'areas' | 'roles' | 'programmes' | 'languages', slugs: readonly string[]) =>
    slugs.map((value) => ({ value, label: t(`options.${group}.${value}`) }));

  return (
    <section aria-labelledby="ep-form-heading" className="rounded-xl border border-border bg-surface p-5 sm:p-6">
      <h2 id="ep-form-heading" className="font-heading text-2xl font-semibold text-ink">
        {t('form.heading')}
      </h2>
      <p className="mt-1 text-sm text-ink-2">{t('form.intro')}</p>

      <form className="relative mt-5 space-y-5" noValidate onSubmit={onSubmit} data-testid="ep-form">
        <noscript>
          <div className="rounded-lg border border-amber bg-surface px-3 py-2 text-sm text-ink">{t('form.noscript')}</div>
        </noscript>

        <p role="alert" className={errorCount > 0 ? 'text-sm font-medium text-bad' : 'sr-only'}>
          {errorCount > 0 ? t('form.error_summary', { count: errorCount }) : ''}
        </p>

        {textField('fullName', fullName, setFullName, { required: true, autoComplete: 'name', maxLength: 120 })}
        {textField('email', email, setEmail, {
          required: true,
          type: 'email',
          inputMode: 'email',
          autoComplete: 'email',
          hint: t('form.email_hint'),
          maxLength: 254,
        })}

        <div>
          <label htmlFor="ep-province" className={labelClass}>
            {t('form.province_label')}
            {requiredMark}
          </label>
          <p id="ep-province-hint" className={hintClass}>
            {t('form.province_hint')}
          </p>
          <ProvinceCombobox
            id="ep-province"
            value={province}
            onChange={(code) => {
              setProvince(code);
              if (code) clear('province');
            }}
            invalid={Boolean(errors.province)}
            describedBy={describedBy('province', true)}
          />
          {fieldError('province')}
        </div>

        <div className="space-y-2">
          {textField('title', title, setTitle, {
            required: true,
            autoComplete: 'organization-title',
            placeholder: t('form.title_placeholder'),
            maxLength: 120,
          })}
          {textField('organization', organization, setOrganization, {
            required: true,
            autoComplete: 'organization',
            placeholder: t('form.organization_placeholder'),
            maxLength: 200,
          })}
          <label htmlFor="ep-isFreelancer" className="inline-flex min-h-11 items-center gap-3 text-sm text-ink">
            <input
              id="ep-isFreelancer"
              name="isFreelancer"
              type="checkbox"
              checked={isFreelancer}
              onChange={(e) => setIsFreelancer(e.target.checked)}
              className={`h-6 w-6 shrink-0 accent-[var(--accent-strong)] ${focusRing}`}
            />
            {t('form.freelancer_label')}
          </label>
        </div>

        <ChoiceGroup
          name="expertiseAreas"
          legend={t('form.areas_legend')}
          hint={t('form.areas_hint')}
          required
          options={opts('areas', EXPERTISE_AREAS)}
          selected={areas}
          onChange={(v) => {
            setAreas(v);
            clear('expertiseAreas');
          }}
          error={err('expertiseAreas')}
          filterLabel={t('form.areas_filter')}
        />
        <ChoiceGroup
          name="roles"
          legend={t('form.roles_legend')}
          hint={t('form.roles_hint')}
          required
          options={opts('roles', ROLES)}
          selected={roles}
          onChange={(v) => {
            setRoles(v);
            clear('roles');
          }}
          error={err('roles')}
        />
        <ChoiceGroup
          name="programmes"
          legend={t('form.programmes_legend')}
          hint={t('form.programmes_hint')}
          required
          options={opts('programmes', PROGRAMMES)}
          selected={programmes}
          onChange={(v) => {
            setProgrammes(v);
            clear('programmes');
          }}
          error={err('programmes')}
        />

        <div className="space-y-5 border-t border-border pt-5">
          <h3 className="text-base font-semibold text-ink">{t('form.optional_heading')}</h3>
          <ChoiceGroup
            name="languages"
            legend={t('form.languages_legend')}
            options={opts('languages', LANGUAGES)}
            selected={languages}
            onChange={(v) => {
              setLanguages(v);
              clear('languages');
            }}
            error={err('languages')}
          />
          {textField('projectCodes', projectCodes, setProjectCodes, {
            placeholder: t('form.projectCodes_placeholder'),
            hint: t('form.projectCodes_hint'),
            maxLength: 200,
          })}
          <div>
            <label htmlFor="ep-orcid" className={labelClass}>
              {t('form.orcid_label')}
            </label>
            <p id="ep-orcid-hint" className={hintClass}>
              {t('form.orcid_hint')}
            </p>
            <input
              id="ep-orcid"
              name="orcid"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0000-0000-0000-0000"
              maxLength={19}
              aria-invalid={errors.orcid ? true : undefined}
              aria-describedby={describedBy('orcid', true)}
              value={orcid}
              onChange={(e) => {
                setOrcid(maskOrcid(e.target.value));
                clear('orcid');
              }}
              className={`${inputClass} font-mono ${border('orcid')}`}
            />
            {fieldError('orcid')}
          </div>
          {textField('linkedinUrl', linkedinUrl, setLinkedinUrl, {
            type: 'url',
            inputMode: 'url',
            autoComplete: 'url',
            placeholder: t('form.linkedinUrl_placeholder'),
            maxLength: 300,
          })}
          {textField('referredBy', referredBy, setReferredBy, { maxLength: 120 })}
        </div>

        {/* Honeypot: off-screen, out of the tab order and the accessibility tree. */}
        <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
          <label htmlFor="ep-website">{t('form.honeypot_label')}</label>
          <input id="ep-website" ref={honeypotRef} name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </div>

        <fieldset className="space-y-3 border-t border-border pt-5">
          <legend className="sr-only">{t('form.consents_legend')}</legend>
          {consentBox(
            'kvkkAccepted',
            kvkkAccepted,
            setKvkkAccepted,
            t.rich('form.kvkk_label', {
              link: (chunks) => (
                <button
                  type="button"
                  onClick={() => kvkkRef.current?.showModal()}
                  aria-haspopup="dialog"
                  className={`inline font-semibold text-accent-ink underline underline-offset-2 ${focusRing}`}
                >
                  {chunks}
                </button>
              ),
            }),
            true,
          )}
          {consentBox('visibilityConsent', visibilityConsent, setVisibilityConsent, t('form.visibility_label'), true)}
          {consentBox('marketingConsent', marketingConsent, setMarketingConsent, t('form.marketing_label'), false)}
        </fieldset>

        <p
          role="alert"
          className={`min-h-5 text-sm font-medium text-bad ${formError ? 'rounded-lg border border-bad bg-surface px-3 py-2' : ''}`}
        >
          {formError}
        </p>

        <button
          type="submit"
          disabled={sending || !hydrated}
          aria-disabled={sending || !hydrated}
          className={`inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-accent-strong px-5 text-base font-semibold text-white transition hover:opacity-90 disabled:opacity-60 sm:w-auto ${focusRing}`}
        >
          {sending ? t('form.sending') : t('form.submit')}
        </button>
      </form>

      <KvkkDialog ref={kvkkRef} blocks={kvkkBlocks} />
    </section>
  );
}
