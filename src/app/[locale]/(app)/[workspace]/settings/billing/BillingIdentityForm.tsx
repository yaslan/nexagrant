'use client';

import React, { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { FileText, ShieldCheck, AlertTriangle, Lock } from 'lucide-react';

import { saveBillingIdentity } from './identity-actions';
import { useActionErrorText } from '@/lib/hooks/use-action-error-text';
import type { BillingIdentityField, BillingIdentityIssue } from '@/lib/billing/billing-identity';

/** One row of the country picker, measured on the server from `vat-rates.ts`. */
export interface BillingIdentityCountryOption {
  code: string;
  /** False for a country in the VAT table whose regime is not yet `standard`. */
  invoiceable: boolean;
}

export interface BillingIdentityValuesOnFile {
  buyerName: string;
  /** Already masked on the server — the full number never reaches the browser. */
  buyerVknTcknMasked: string;
  buyerTaxOffice: string;
  buyerAddress: string;
  buyerCity: string;
  buyerCountry: string;
}

interface Props {
  locale: string;
  /** What is on file today, or null when this tenant has never saved an identity. */
  onFile: BillingIdentityValuesOnFile | null;
  /** False for every role but TENANT_OWNER; the form is then not rendered at all. */
  canEdit: boolean;
  countries: BillingIdentityCountryOption[];
}

type FormState = {
  buyerName: string;
  buyerVknTckn: string;
  buyerTaxOffice: string;
  buyerAddress: string;
  buyerCity: string;
  buyerCountry: string;
};

const ERROR_KEY: Record<BillingIdentityIssue['code'], string> = {
  required: 'identityErrRequired',
  too_long: 'identityErrTooLong',
  vkn_tckn_not_digits: 'identityErrDigits',
  vkn_tckn_length: 'identityErrLength',
  vkn_tckn_checksum: 'identityErrChecksum',
  country_unknown: 'identityErrCountry',
};

export function BillingIdentityForm({ locale, onFile, canEdit, countries }: Props) {
  const t = useTranslations('billingPanels.settings');
  const [pending, startTransition] = useTransition();
  const errorText = useActionErrorText();
  const [issues, setIssues] = useState<BillingIdentityIssue[]>([]);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);

  // The number on file is never loaded into the input: it arrives masked and the
  // field starts empty, so re-saving the form asks for it again rather than
  // round-tripping a TCKN through the browser (KVKK md.5-6, processing register §5).
  const [form, setForm] = useState<FormState>({
    buyerName: onFile?.buyerName ?? '',
    buyerVknTckn: '',
    buyerTaxOffice: onFile?.buyerTaxOffice ?? '',
    buyerAddress: onFile?.buyerAddress ?? '',
    buyerCity: onFile?.buyerCity ?? '',
    buyerCountry: onFile?.buyerCountry ?? 'TR',
  });

  // ISO-3166 alpha-2 turned into a name in the reader's own language, rather
  // than 29 country names added to both message catalogues by hand.
  const countryName = useMemo(() => {
    let display: Intl.DisplayNames | null = null;
    try {
      display = new Intl.DisplayNames([locale === 'tr' ? 'tr' : 'en'], { type: 'region' });
    } catch {
      display = null;
    }
    return (code: string) => {
      try {
        return display?.of(code) ?? code;
      } catch {
        return code;
      }
    };
  }, [locale]);

  const issueFor = (field: BillingIdentityField) => issues.find((i) => i.field === field);

  const selectedCountry = countries.find((c) => c.code === form.buyerCountry);
  const selectedNotChargeable = selectedCountry ? !selectedCountry.invoiceable : false;

  if (!canEdit) {
    return (
      <section
        data-testid="billing-identity-locked"
        className="bg-surface border rounded-2xl p-6 shadow-xs space-y-2"
      >
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-muted" aria-hidden />
          <h3 className="text-base font-bold text-ink font-heading">{t('identityTitle')}</h3>
        </div>
        <p className="text-xs text-muted">{t('identityLockedBody')}</p>
      </section>
    );
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setBanner(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof saveBillingIdentity>>;
      try {
        result = await saveBillingIdentity(form);
      } catch (error) {
        setBanner({ kind: 'err', text: errorText(error, () => t('identityErrWrite')) });
        return;
      }
      if (result.ok) {
        setIssues([]);
        setForm((prev) => ({ ...prev, buyerVknTckn: '' }));
        setBanner(
          result.invoiceable
            ? { kind: 'ok', text: t('identitySaved') }
            : { kind: 'warn', text: t('identitySavedNotChargeable', { country: countryName(result.country) }) }
        );
        return;
      }
      if (result.error === 'validation_failed') {
        setIssues(result.issues ?? []);
        setBanner({ kind: 'err', text: t('identityErrValidation') });
        return;
      }
      setIssues([]);
      setBanner({
        kind: 'err',
        text: result.error === 'forbidden' ? t('identityErrForbidden') : t('identityErrWrite'),
      });
    });
  };

  const field = (
    name: Exclude<BillingIdentityField, 'buyerCountry'>,
    label: string,
    extra?: { hint?: string; type?: string; placeholder?: string; multiline?: boolean }
  ) => {
    const issue = issueFor(name);
    const cls = `w-full rounded-xl border px-3 py-2 text-sm bg-ground text-ink ${
      issue ? 'border-red-400' : 'border-border'
    }`;
    return (
      <div className="space-y-1">
        <label htmlFor={name} className="text-[11px] font-semibold text-muted block">
          {label}
        </label>
        {extra?.multiline ? (
          <textarea
            id={name}
            name={name}
            rows={2}
            className={cls}
            value={form[name]}
            aria-invalid={issue ? true : undefined}
            aria-describedby={issue ? `${name}-error` : undefined}
            onChange={(e) => setForm((p) => ({ ...p, [name]: e.target.value }))}
          />
        ) : (
          <input
            id={name}
            name={name}
            type={extra?.type ?? 'text'}
            className={cls}
            value={form[name]}
            placeholder={extra?.placeholder}
            aria-invalid={issue ? true : undefined}
            aria-describedby={issue ? `${name}-error` : undefined}
            onChange={(e) => setForm((p) => ({ ...p, [name]: e.target.value }))}
          />
        )}
        {extra?.hint && !issue && <p className="text-[11px] text-muted">{extra.hint}</p>}
        {issue && (
          <p id={`${name}-error`} data-testid={`identity-error-${name}`} className="text-[11px] font-semibold text-red-600">
            {t(ERROR_KEY[issue.code])}
          </p>
        )}
      </div>
    );
  };

  return (
    <section
      id="billing-identity"
      data-testid="billing-identity"
      className="bg-surface border rounded-2xl p-6 shadow-xs space-y-6"
    >
      <div className="border-b pb-4 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-blue-100 text-blue-800 border border-blue-200 px-2 py-0.5 rounded font-mono font-bold">
            {t('identityBadge')}
          </span>
          <h3 className="text-base font-bold text-ink font-heading">{t('identityTitle')}</h3>
        </div>
        <p className="text-xs text-muted">{t('identityBody')}</p>
      </div>

      {!onFile && (
        <div
          data-testid="billing-identity-missing"
          className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex gap-2"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" aria-hidden />
          <span>{t('identityMissingWarning')}</span>
        </div>
      )}

      {onFile && (
        <div
          data-testid="billing-identity-onfile"
          className="bg-ground border border-border rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs"
        >
          <div>
            <span className="text-[11px] text-muted block">{t('identityFieldName')}</span>
            <span className="font-bold text-ink block mt-0.5">{onFile.buyerName}</span>
          </div>
          <div>
            <span className="text-[11px] text-muted block">{t('identityFieldVknTckn')}</span>
            <span className="font-bold text-ink block mt-0.5 font-mono">{onFile.buyerVknTcknMasked}</span>
            <span className="text-[10px] text-muted block">{t('identityMaskedHint')}</span>
          </div>
          <div>
            <span className="text-[11px] text-muted block">{t('identityFieldCountry')}</span>
            <span className="font-bold text-ink block mt-0.5">{countryName(onFile.buyerCountry)}</span>
          </div>
        </div>
      )}

      {banner && (
        <div
          role="status"
          data-testid="billing-identity-banner"
          className={`rounded-xl p-3 text-xs font-semibold border ${
            banner.kind === 'ok'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : banner.kind === 'warn'
              ? 'bg-amber-50 text-amber-900 border-amber-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          {banner.text}
        </div>
      )}

      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {field('buyerName', t('identityFieldName'))}
          {field('buyerVknTckn', t('identityFieldVknTckn'), {
            hint: t('identityVknHint'),
            placeholder: t('identityVknPlaceholder'),
          })}
          {field('buyerTaxOffice', t('identityFieldTaxOffice'))}
          {field('buyerCity', t('identityFieldCity'))}
        </div>

        {field('buyerAddress', t('identityFieldAddress'), { multiline: true })}

        <div className="space-y-1">
          <label htmlFor="buyerCountry" className="text-[11px] font-semibold text-muted block">
            {t('identityFieldCountry')}
          </label>
          <select
            id="buyerCountry"
            name="buyerCountry"
            className="w-full rounded-xl border border-border px-3 py-2 text-sm bg-ground text-ink"
            value={form.buyerCountry}
            onChange={(e) => setForm((p) => ({ ...p, buyerCountry: e.target.value }))}
          >
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {countryName(c.code)}
                {c.invoiceable ? '' : ` — ${t('identityCountryPending')}`}
              </option>
            ))}
          </select>
          {/* Said before the save, not after: an EU country is stored happily and
              still produces no invoice, because its VAT regime is undecided. */}
          {selectedNotChargeable && (
            <p data-testid="identity-country-warning" className="text-[11px] text-amber-700 font-semibold">
              {t('identityCountryPendingHint')}
            </p>
          )}
          {issueFor('buyerCountry') && (
            <p data-testid="identity-error-buyerCountry" className="text-[11px] font-semibold text-red-600">
              {t(ERROR_KEY[issueFor('buyerCountry')!.code])}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 pt-2">
          <p className="text-[11px] text-muted flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden />
            {t('identityPrivacyNote')}
          </p>
          <button
            type="submit"
            data-testid="billing-identity-save"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50 disabled:cursor-wait cursor-pointer"
          >
            <FileText className="w-4 h-4" aria-hidden />
            {pending ? t('identitySaving') : t('identitySave')}
          </button>
        </div>
      </form>
    </section>
  );
}
