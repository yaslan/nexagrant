'use client';

import { useId, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import {
  OUTREACH_TEMPLATE_IDS,
  buildMailto,
  buildPartnerSearchLinks,
  fillTemplate,
  type OutreachTemplateId,
} from '@/modules/m1/outreach';

type TemplateLang = 'tr' | 'en';
type TemplateSet = Record<OutreachTemplateId, { subject: string; body: string }>;

export interface PartnerOutreachProps {
  orgName: string;
  country: string | null;
  /** The organisation's CORDIS topics, most frequent first. */
  topics: { code: string; title: string | null }[];
  /** Raw template strings from messages/tr.json and messages/en.json (PartnerOutreach.templates). */
  templates: Record<TemplateLang, TemplateSet>;
  /** Initial template language — the UI locale. */
  locale: string;
}

const inputClass =
  'w-full rounded-lg border border-border bg-ground px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent';
const buttonClass =
  'inline-flex items-center justify-center rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent';

function CopyButton({ text, label }: { text: string; label: string }) {
  const t = useTranslations('PartnerOutreach');
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={copy} className={buttonClass} data-testid="outreach-copy">
        {state === 'copied' ? t('copied') : label}
      </button>
      <span role="status" aria-live="polite" className="text-xs text-muted">
        {state === 'failed' ? t('copyFailed') : ''}
      </span>
    </span>
  );
}

export function PartnerOutreach({ orgName, country, topics, templates, locale }: PartnerOutreachProps) {
  const t = useTranslations('PartnerOutreach');
  const ids = useId();

  const [topicCode, setTopicCode] = useState(topics[0]?.code ?? '');
  const topic = topics.find((tp) => tp.code === topicCode) ?? null;
  const links = useMemo(
    () => buildPartnerSearchLinks({ orgName, country, topic }),
    [orgName, country, topic],
  );

  const [templateId, setTemplateId] = useState<OutreachTemplateId>('invite');
  const [lang, setLang] = useState<TemplateLang>(locale === 'tr' ? 'tr' : 'en');
  const [institution, setInstitution] = useState(orgName);
  const [callCode, setCallCode] = useState('');
  const [projectTitle, setProjectTitle] = useState('');

  const values = { institution, callCode, projectTitle };
  const template = templates[lang][templateId];
  const subject = fillTemplate(template.subject, values);
  const body = fillTemplate(template.body, values);

  return (
    <div className="space-y-8">
      <section aria-labelledby={`${ids}-search`} data-testid="partner-outreach-search">
        <h2 id={`${ids}-search`} className="text-lg font-bold font-heading text-ink mb-2">
          {t('title')}
        </h2>
        <p className="text-xs text-muted mb-4">{t('intro')}</p>

        {topics.length > 0 && (
          <div className="mb-4 max-w-md">
            <label htmlFor={`${ids}-topic`} className="block text-xs font-semibold text-ink-2 mb-1">
              {t('topicLabel')}
            </label>
            <select
              id={`${ids}-topic`}
              value={topicCode}
              onChange={(e) => setTopicCode(e.target.value)}
              className={inputClass}
            >
              <option value="">{t('topicNone')}</option>
              {topics.map((tp) => (
                <option key={tp.code} value={tp.code}>
                  {tp.title ? `${tp.code} — ${tp.title}` : tp.code}
                </option>
              ))}
            </select>
          </div>
        )}

        <ul className="space-y-3">
          {links.map((link) => {
            const name = t(`sources.${link.id}.name`);
            return (
              <li
                key={link.id}
                className="p-4 border border-border rounded-xl bg-ground flex flex-col gap-2"
                data-testid={`outreach-link-${link.id}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-ink">{name}</div>
                    <div className="text-xs text-muted">{t(`sources.${link.id}.hint`)}</div>
                  </div>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t('openAria', { source: name })}
                    className={buttonClass}
                  >
                    {t('open')} ↗
                  </a>
                </div>
                {link.prefilled ? (
                  <div className="text-[11px] text-accent-ink">{t('prefilled')}</div>
                ) : (
                  <div className="text-[11px] text-muted">{t('notPrefilled')}</div>
                )}
                {link.searchText !== '' && !link.prefilled && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold text-ink-2">{t('searchTextLabel')}:</span>
                    <code className="text-xs bg-surface border border-border rounded px-2 py-0.5 break-all">
                      {link.searchText}
                    </code>
                    <CopyButton text={link.searchText} label={t('copy')} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby={`${ids}-email`} data-testid="partner-outreach-email">
        <h2 id={`${ids}-email`} className="text-lg font-bold font-heading text-ink mb-2">
          {t('emailTitle')}
        </h2>
        <p className="text-xs text-muted mb-4">{t('emailIntro')}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label htmlFor={`${ids}-tpl`} className="block text-xs font-semibold text-ink-2 mb-1">
              {t('templateLabel')}
            </label>
            <select
              id={`${ids}-tpl`}
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value as OutreachTemplateId)}
              className={inputClass}
            >
              {OUTREACH_TEMPLATE_IDS.map((id) => (
                <option key={id} value={id}>
                  {t(`templateNames.${id}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${ids}-lang`} className="block text-xs font-semibold text-ink-2 mb-1">
              {t('templateLangLabel')}
            </label>
            <select
              id={`${ids}-lang`}
              value={lang}
              onChange={(e) => setLang(e.target.value === 'tr' ? 'tr' : 'en')}
              className={inputClass}
            >
              <option value="tr">{t('langTr')}</option>
              <option value="en">{t('langEn')}</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${ids}-inst`} className="block text-xs font-semibold text-ink-2 mb-1">
              {t('institutionLabel')}
            </label>
            <input
              id={`${ids}-inst`}
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${ids}-call`} className="block text-xs font-semibold text-ink-2 mb-1">
              {t('callCodeLabel')}
            </label>
            <input
              id={`${ids}-call`}
              value={callCode}
              placeholder={t('callCodePlaceholder')}
              onChange={(e) => setCallCode(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={`${ids}-title`} className="block text-xs font-semibold text-ink-2 mb-1">
              {t('projectTitleLabel')}
            </label>
            <input
              id={`${ids}-title`}
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor={`${ids}-subject`} className="block text-xs font-semibold text-ink-2 mb-1">
              {t('subjectLabel')}
            </label>
            <input id={`${ids}-subject`} readOnly value={subject} className={inputClass} data-testid="outreach-subject" />
          </div>
          <div>
            <label htmlFor={`${ids}-body`} className="block text-xs font-semibold text-ink-2 mb-1">
              {t('bodyLabel')}
            </label>
            <textarea
              id={`${ids}-body`}
              readOnly
              value={body}
              rows={12}
              className={`${inputClass} font-mono text-xs`}
              data-testid="outreach-body"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={`${subject}\n\n${body}`} label={t('copyEmail')} />
            <a href={buildMailto(subject, body)} className={buttonClass} data-testid="outreach-mailto">
              {t('openMail')}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
