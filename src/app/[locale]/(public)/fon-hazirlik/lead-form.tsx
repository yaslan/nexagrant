'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { analytics } from '@/lib/analytics';
import { PRODUCT_NAME } from '@/lib/brand';
import { PRIVACY_NOTICE } from '@/lib/legal/consent-documents';
import {
  PUBLIC_CONTACT_EMAIL,
  PUBLIC_LEAD_CONSENT,
  publicLeadRetentionMonths,
  type PublicLeadField,
  type PublicLeadResult,
} from '@/lib/leads/public-lead-policy';
import type { ReadinessLevel, ReadinessOrgType } from '@/lib/readiness/score';
import { TR_PROVINCES, type TrProvince } from '@/lib/readiness/provinces';
import { getTransferOrgName, submitReadinessLead } from './actions';

interface LeadFormProps {
  locale: string;
  orgType: ReadinessOrgType;
  level: ReadinessLevel;
  province: TrProvince | null;
  /** `<orgType>.<15 answers>`; the server recomputes the score from it. */
  readinessCode: string | null;
}

type FieldErrors = Partial<Record<PublicLeadField | 'consent', string>>;

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
const inputClass = `mt-1 min-h-11 w-full rounded-lg border bg-surface px-3 text-sm text-ink ${focusRing}`;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELD_ORDER: readonly (PublicLeadField | 'consent')[] = ['name', 'email', 'organisation', 'province', 'district', 'consent'];
const noSubscribe = () => () => {};

/**
 * Contact form on the readiness result screen (TASK-MULR765AR5G0C). Nothing is
 * sent until the explicit-consent box is ticked; the server repeats every check.
 */
export default function LeadForm({ locale, orgType, level, province, readinessCode }: LeadFormProps) {
  const t = useTranslations('readiness.lead');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [organisation, setOrganisation] = useState('');
  const [leadProvince, setLeadProvince] = useState<string>(province ?? '');
  const [district, setDistrict] = useState('');
  const [consent, setConsent] = useState(false);
  // NG-179: the optional, separate transfer box. Unticked by default.
  const [transferConsent, setTransferConsent] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFor, setTransferFor] = useState<{ province: string; name: string | null } | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const honeypotRef = useRef<HTMLInputElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const months = publicLeadRetentionMonths();
  // The form is server-rendered without an action: before hydration a click on
  // submit is a native GET to this page, which puts the name and e-mail in the URL
  // and drops the result query. The button stays disabled until onSubmit is live.
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );

  // After the success panel has rendered, not before: a keyboard or screen-reader
  // user lands on the confirmation instead of the top of the page.
  useEffect(() => {
    if (sent) successRef.current?.focus();
  }, [sent]);

  // NG-179: the organisation under the transfer box follows the chosen province. A late answer for
  // a province the visitor already left is dropped; a failed lookup leaves the box hidden (fail closed).
  useEffect(() => {
    if (!leadProvince) return;
    let stale = false;
    getTransferOrgName({ province: leadProvince })
      .then((r) => {
        if (!stale) setTransferFor({ province: leadProvince, name: r.name });
      })
      .catch(() => {
        if (!stale) setTransferFor({ province: leadProvince, name: null });
      });
    return () => {
      stale = true;
    };
  }, [leadProvince]);
  // The box shows only for the province that is selected now, and only when it has an organisation.
  const transferName = transferFor && transferFor.province === leadProvince ? transferFor.name : null;

  const messageFor: Record<PublicLeadField | 'consent', string> = {
    name: t('error_name'),
    email: t('error_email'),
    organisation: t('error_organisation'),
    province: t('error_province'),
    district: t('error_district'),
    consent: t('error_consent'),
  };

  function localErrors(): FieldErrors {
    const out: FieldErrors = {};
    if (name.trim().length < 2) out.name = messageFor.name;
    if (!EMAIL_PATTERN.test(email.trim())) out.email = messageFor.email;
    if (organisation.trim().length < 2) out.organisation = messageFor.organisation;
    if (district.trim().length > 80) out.district = messageFor.district;
    if (!consent) out.consent = messageFor.consent;
    return out;
  }

  function showErrors(next: FieldErrors) {
    setErrors(next);
    const first = FIELD_ORDER.find((f) => next[f]);
    if (first) document.getElementById(`lead-${first}`)?.focus();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending) return;
    setFormError(null);
    const found = localErrors();
    if (Object.keys(found).length > 0) {
      showErrors(found);
      return;
    }
    setErrors({});
    setSending(true);
    let result: PublicLeadResult;
    try {
      result = await submitReadinessLead({
        name,
        email,
        organisation,
        province: leadProvince,
        district,
        readinessCode,
        consent,
        consentVersion: PUBLIC_LEAD_CONSENT.version,
        // Sent only while the box is on screen; the server writes the version and time itself.
        transferConsent: transferName !== null && transferConsent,
        source: 'fon-hazirlik',
        locale: locale === 'en' ? 'en' : 'tr',
        website: honeypotRef.current?.value ?? '',
      });
    } catch {
      result = { ok: false, error: 'server' };
    }
    setSending(false);

    if (result.ok) {
      // No PII: a closed category and a level.
      analytics.track('readiness_lead_submitted', { orgType, level });
      setSent(true);
      return;
    }
    switch (result.error) {
      case 'invalid':
        showErrors(Object.fromEntries(result.fields.map((f) => [f, messageFor[f]])));
        break;
      case 'consent_required':
        showErrors({ consent: messageFor.consent });
        break;
      case 'consent_outdated':
        setFormError(t('error_outdated'));
        break;
      case 'rate_limited':
        setFormError(t('error_rate'));
        break;
      default:
        setFormError(t('error_server'));
    }
  }

  if (sent) {
    return (
      <section aria-labelledby="lead-heading" className="rounded-xl border border-ok bg-surface p-5 print:hidden">
        <h2 id="lead-heading" ref={successRef} tabIndex={-1} className="font-heading text-xl font-semibold text-ink outline-none">
          {t('success_title')}
        </h2>
        <p role="status" className="mt-1 text-sm text-ink">
          {t('success_text')}
        </p>
      </section>
    );
  }

  const describedBy = (field: PublicLeadField | 'consent', hint?: string) =>
    [hint, errors[field] ? `lead-${field}-error` : null].filter(Boolean).join(' ') || undefined;

  const fieldError = (field: PublicLeadField | 'consent') =>
    errors[field] ? (
      <p id={`lead-${field}-error`} className="mt-1 text-sm font-medium text-bad">
        {errors[field]}
      </p>
    ) : null;

  const border = (field: PublicLeadField) => (errors[field] ? 'border-bad' : 'border-border');
  const requiredMark = (
    <span className="text-bad" aria-hidden="true">
      {' *'}
    </span>
  );

  return (
    <section aria-labelledby="lead-heading" className="rounded-xl border border-border bg-surface p-5 print:hidden">
      <h2 id="lead-heading" className="font-heading text-xl font-semibold text-ink">
        {t('title')}
      </h2>
      <p className="mt-1 text-sm text-ink-2">{t('intro')}</p>

      <form className="relative mt-4 space-y-4" noValidate onSubmit={onSubmit}>
        <noscript>
          <div className="rounded-lg border border-warn bg-surface px-3 py-2 text-sm text-warn">
            {t('noscript_message')}
          </div>
        </noscript>
        <div>
          <label htmlFor="lead-name" className="block text-sm font-medium text-ink">
            {t('name_label')}
            {requiredMark}
          </label>
          <input
            id="lead-name"
            name="name"
            type="text"
            autoComplete="name"
            required
            maxLength={120}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErrors((prev) => ({ ...prev, name: undefined }));
            }}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={describedBy('name')}
            className={`${inputClass} ${border('name')}`}
          />
          {fieldError('name')}
        </div>

        <div>
          <label htmlFor="lead-email" className="block text-sm font-medium text-ink">
            {t('email_label')}
            {requiredMark}
          </label>
          <p id="lead-email-hint" className="text-xs text-muted">
            {t('email_hint')}
          </p>
          <input
            id="lead-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErrors((prev) => ({ ...prev, email: undefined }));
            }}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={describedBy('email', 'lead-email-hint')}
            className={`${inputClass} ${border('email')}`}
          />
          {fieldError('email')}
        </div>

        <div>
          <label htmlFor="lead-organisation" className="block text-sm font-medium text-ink">
            {t('organisation_label')}
            {requiredMark}
          </label>
          <input
            id="lead-organisation"
            name="organisation"
            type="text"
            autoComplete="organization"
            required
            maxLength={200}
            value={organisation}
            onChange={(e) => {
              setOrganisation(e.target.value);
              setErrors((prev) => ({ ...prev, organisation: undefined }));
            }}
            aria-invalid={errors.organisation ? true : undefined}
            aria-describedby={describedBy('organisation')}
            className={`${inputClass} ${border('organisation')}`}
          />
          {fieldError('organisation')}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="lead-province" className="block text-sm font-medium text-ink">
              {t('province_label')}
            </label>
            <select
              id="lead-province"
              name="province"
              value={leadProvince}
              onChange={(e) => {
                setLeadProvince(e.target.value);
                setErrors((prev) => ({ ...prev, province: undefined }));
              }}
              aria-invalid={errors.province ? true : undefined}
              aria-describedby={describedBy('province')}
              className={`${inputClass} ${border('province')}`}
            >
              <option value="">{t('province_none')}</option>
              {TR_PROVINCES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {fieldError('province')}
          </div>
          <div>
            <label htmlFor="lead-district" className="block text-sm font-medium text-ink">
              {t('district_label')}
            </label>
            <input
              id="lead-district"
              name="district"
              type="text"
              autoComplete="address-level2"
              maxLength={80}
              value={district}
              onChange={(e) => {
                setDistrict(e.target.value);
                setErrors((prev) => ({ ...prev, district: undefined }));
              }}
              aria-invalid={errors.district ? true : undefined}
              aria-describedby={describedBy('district')}
              className={`${inputClass} ${border('district')}`}
            />
            {fieldError('district')}
          </div>
        </div>

        {/* Honeypot: off-screen and out of the tab order, so only a bot fills it. */}
        <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
          <label htmlFor="lead-website">{t('honeypot_label')}</label>
          <input id="lead-website" ref={honeypotRef} name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </div>

        <div>
          <div className="flex items-start gap-3">
            <input
              id="lead-consent"
              name="consent"
              type="checkbox"
              required
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                if (e.target.checked) setErrors((prev) => ({ ...prev, consent: undefined }));
              }}
              aria-invalid={errors.consent ? true : undefined}
              aria-describedby={describedBy('consent', 'lead-consent-withdraw')}
              className={`h-6 w-6 shrink-0 accent-[var(--accent-strong)] ${focusRing}`}
            />
            <label htmlFor="lead-consent" className="text-sm leading-relaxed text-ink">
              {t('consent_label', { months, brand: PRODUCT_NAME })}
              {requiredMark}
            </label>
          </div>
          <p id="lead-consent-withdraw" className="mt-1 pl-9 text-xs text-muted">
            {t('consent_withdraw')}{' '}
            <a
              href={PRIVACY_NOTICE.href(locale)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('consent_notice_aria')}
              className={`inline-flex min-h-6 items-center font-semibold text-accent-ink underline underline-offset-2 ${focusRing}`}
            >
              {t('consent_notice')}
            </a>
          </p>
          <div className="pl-9">{fieldError('consent')}</div>
        </div>

        {transferName !== null ? (
          <div className="rounded-lg border border-border px-3 py-3">
            <div className="flex items-start gap-3">
              <input
                id="lead-transfer"
                name="transfer"
                type="checkbox"
                checked={transferConsent}
                onChange={(e) => setTransferConsent(e.target.checked)}
                aria-describedby="lead-transfer-org"
                className={`h-6 w-6 shrink-0 accent-[var(--accent-strong)] ${focusRing}`}
              />
              <label htmlFor="lead-transfer" className="text-sm leading-relaxed text-ink">
                {t('transfer_label')}
              </label>
            </div>
            <p id="lead-transfer-org" className="mt-1 pl-9 text-sm text-ink-2">
              {t('transfer_org_line', { name: transferName })}
            </p>
            <button
              type="button"
              aria-expanded={transferOpen}
              aria-controls="lead-transfer-details"
              onClick={() => setTransferOpen((open) => !open)}
              className={`mt-2 ml-9 inline-flex min-h-11 items-center text-sm font-semibold text-accent-ink underline underline-offset-2 ${focusRing}`}
            >
              {t('transfer_details_toggle')}
            </button>
            <div id="lead-transfer-details" hidden={!transferOpen} className="mt-2 space-y-3 pl-9 text-sm text-ink-2">
              {(
                [
                  ['transfer_what_q', 'transfer_what_a', undefined],
                  ['transfer_to_q', 'transfer_to_a', undefined],
                  ['transfer_purpose_q', 'transfer_purpose_a', undefined],
                  ['transfer_retention_q', 'transfer_retention_a', { months }],
                  ['transfer_withdraw_q', 'transfer_withdraw_a', { email: PUBLIC_CONTACT_EMAIL }],
                  ['transfer_skip_q', 'transfer_skip_a', undefined],
                ] as const
              ).map(([q, a, values]) => (
                <div key={q}>
                  <p className="font-semibold text-ink">{t(q)}</p>
                  <p>{values ? t(a, values) : t(a)}</p>
                </div>
              ))}
              <p>
                {t('transfer_more_info')}{' '}
                <a
                  href={PRIVACY_NOTICE.href(locale)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t('consent_notice_aria')}
                  className={`inline-flex min-h-6 items-center font-semibold text-accent-ink underline underline-offset-2 ${focusRing}`}
                >
                  {t('consent_notice')}
                </a>
              </p>
            </div>
          </div>
        ) : null}

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
          className={`inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-accent-strong px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60 sm:w-auto ${focusRing}`}
        >
          {sending ? t('sending') : t('submit')}
        </button>
      </form>
    </section>
  );
}
