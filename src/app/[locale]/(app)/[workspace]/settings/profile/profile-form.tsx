'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Building, Sparkles, Key, CheckCircle, AlertCircle, Fingerprint } from 'lucide-react';
import Link from 'next/link';
import { getWorkspaceRoute } from '@/lib/routes';
import { updateTenantProfile, type PicCordisMatch } from './actions';
import { DEFAULT_TRL_RANGE, parseKeywords } from './profile-fields';

const PARTICIPANT_REGISTER_URL =
  'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/how-to-participate/participant-register';

/** "Ankara, TR"; only the parts CORDIS has. */
function placeOf(match: PicCordisMatch): string {
  return [match.city, match.country].filter(Boolean).join(', ');
}

/** The tenant's stored profile, read by page.tsx; null when it has never saved one. */
export interface StoredTenantProfile {
  capabilities: string;
  keywords: string[];
  trlRange: number[];
}

/** The row as the fields show it. A tenant with no row starts empty: the sample text is a placeholder. */
function storedFields(initial: StoredTenantProfile | null) {
  return {
    capabilities: initial?.capabilities ?? '',
    keywords: initial?.keywords.join(', ') ?? '',
    trlMin: initial?.trlRange[0] ?? DEFAULT_TRL_RANGE.min,
    trlMax: initial?.trlRange[1] ?? DEFAULT_TRL_RANGE.max,
  };
}

/** Compared the way the action stores them, so a stray space does not count as a change. */
const sameCapabilities = (a: string, b: string) => a.trim() === b.trim();
const sameKeywords = (a: string, b: string) => parseKeywords(a).join() === parseKeywords(b).join();

export default function TenantProfileForm({
  initial,
  initialPic = null,
  initialPicMatch = null,
  supportEmail,
}: {
  initial: StoredTenantProfile | null;
  initialPic?: string | null;
  initialPicMatch?: PicCordisMatch | null;
  /** Where the real owner of a PIC held by another account can write (K-576942). */
  supportEmail: string;
}) {
  const params = useParams();
  const locale = (params?.locale as string) || 'tr';
  const workspace = (params?.workspace as string) || 'default';
  const t = useTranslations('Profile');

  const loaded = storedFields(initial);
  // What this form knows the row holds: the page's last read, or a refusal that told it more.
  const [stored, setStored] = useState(loaded);
  const [capabilities, setCapabilities] = useState(stored.capabilities);
  const [keywords, setKeywords] = useState(stored.keywords);
  const [trlMin, setTrlMin] = useState(stored.trlMin);
  const [trlMax, setTrlMax] = useState(stored.trlMax);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  // FO-393. A save that sent nothing changed nothing: it says so instead of "updated".
  const [nothingToSave, setNothingToSave] = useState(false);
  const [error, setError] = useState('');
  // Beside the TRL fields, next to the button: the banner above the form can be off screen here.
  const [trlError, setTrlError] = useState('');
  const trlErrorRef = useRef<HTMLParagraphElement>(null);

  // FO-383. `savedPic` + `savedPicMatch` are what the database holds; the line under the field
  // describes them and only them, so it goes quiet while the user is typing something else.
  const [pic, setPic] = useState(initialPic ?? '');
  const [savedPic, setSavedPic] = useState(initialPic ?? '');
  const [savedPicMatch, setSavedPicMatch] = useState(initialPicMatch);
  const [picCleared, setPicCleared] = useState(false);
  const [picError, setPicError] = useState<'invalid' | 'taken' | 'rateLimited' | null>(null);
  const [picRetryMinutes, setPicRetryMinutes] = useState(0);
  const [pendingMatch, setPendingMatch] = useState<PicCordisMatch | null>(null);
  const picInputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const picInputId = useId();
  const picHelpId = useId();
  const picFeedbackId = useId();
  const capabilitiesId = useId();
  const keywordsId = useId();
  const trlMinId = useId();
  const trlMaxId = useId();

  // FO-387. Same rule as the PIC below, for the other fields: a re-read page brings the row into
  // whatever the user has not edited and leaves the rest alone.
  // FO-393 (N1). A re-read is a new `initial` object, not a different value: after a refusal taught
  // `stored` a range, the row can go back to the very value this page opened with, and that read
  // has to land too. Between reads the prop keeps its identity, so this runs once per read.
  const [seenInitial, setSeenInitial] = useState(initial);
  if (initial !== seenInitial) {
    setSeenInitial(initial);
    setStored(loaded);
    if (sameCapabilities(capabilities, stored.capabilities)) setCapabilities(loaded.capabilities);
    if (sameKeywords(keywords, stored.keywords)) setKeywords(loaded.keywords);
    if (trlMin === stored.trlMin) setTrlMin(loaded.trlMin);
    if (trlMax === stored.trlMax) setTrlMax(loaded.trlMax);
  }
  const capabilitiesEdited = !sameCapabilities(capabilities, stored.capabilities);
  const keywordsEdited = !sameKeywords(keywords, stored.keywords);
  const trlMinEdited = trlMin !== stored.trlMin;
  const trlMaxEdited = trlMax !== stored.trlMax;
  // A tenant with no profile may save only a PIC; the first thing it writes into the profile needs
  // both texts. With a row, a text is required once the user has emptied it.
  const profileEdited = capabilitiesEdited || keywordsEdited || trlMinEdited || trlMaxEdited;
  // FO-393 (B3). Without a row, the form cannot know whether a colleague has made one since it
  // opened, so the server decides: the browser only holds the save once the server has said there is
  // still no row (`noRowSaid`), and until the page is re-read.
  const [noRowSaid, setNoRowSaid] = useState(false);
  const capabilitiesRequired = initial ? capabilitiesEdited : noRowSaid && profileEdited;
  const keywordsRequired = initial ? keywordsEdited : noRowSaid && profileEdited;
  const formRef = useRef<HTMLFormElement>(null);
  const [askValidity, setAskValidity] = useState(0);

  // A save re-reads the page (revalidatePath), so a form left open learns what someone else did to
  // the PIC meanwhile. What the user is in the middle of typing stays theirs.
  const loadedPic = initialPic ?? '';
  const [seenLoadedPic, setSeenLoadedPic] = useState(loadedPic);
  if (loadedPic !== seenLoadedPic) {
    setSeenLoadedPic(loadedPic);
    setSavedPic(loadedPic);
    setSavedPicMatch(initialPicMatch);
    if (pic === savedPic) setPic(loadedPic);
  }

  // Keyboard and screen-reader users land on the question. In an effect, not a frame after
  // the setState: a slow commit left the ref empty then, and the focus was simply lost.
  useEffect(() => {
    if (pendingMatch) confirmRef.current?.focus();
  }, [pendingMatch]);
  // Focus also brings it on screen when the save came from Enter in a field at the top of the form.
  useEffect(() => {
    if (trlError) trlErrorRef.current?.focus();
  }, [trlError]);
  // After `required` is on the fields: the browser points at the missing one, as it would have.
  useEffect(() => {
    if (askValidity) formRef.current?.reportValidity();
  }, [askValidity]);

  const save = async (confirmedPic?: string) => {
    // FO-393 (N2). Numbers that are wrong as the form shows them are the user's own to fix, whatever
    // the row holds now: said here, before anything is sent, and never blamed on a colleague.
    if (trlMin > trlMax) {
      setSavedSuccess(false);
      setNothingToSave(false);
      setError('');
      setTrlError(t('errorTrlOrder', { min: trlMin, max: trlMax }));
      return;
    }
    // Only what the user changed, for the reason given under `pic`.
    const sent = {
      capabilities: capabilitiesEdited ? capabilities : undefined,
      keywords: keywordsEdited ? keywords : undefined,
      trlMin: trlMinEdited ? trlMin : undefined,
      trlMax: trlMaxEdited ? trlMax : undefined,
      // Only a PIC the user changed: sending the one this form opened with would undo whatever
      // staff or a colleague did to it since, on a save that was about the keywords.
      pic: pic === savedPic ? undefined : pic,
    };
    const nothingSent = confirmedPic === undefined && Object.values(sent).every((value) => value === undefined);

    setSaving(true);
    setSavedSuccess(false);
    setNothingToSave(false);
    setError('');
    setTrlError('');
    setPicError(null);
    setPicCleared(false);

    // Sent even when empty: the save re-reads the page, which is how the form learns the row.
    const result = await updateTenantProfile({ ...sent, confirmedPic });

    setSaving(false);

    if (result.ok) {
      setPendingMatch(null);
      if (result.pic?.status === 'cleared') {
        setPic('');
        setSavedPic('');
        setSavedPicMatch(null);
        setPicCleared(true);
      } else if (result.pic) {
        setPic(result.pic.value);
        setSavedPic(result.pic.value);
        setSavedPicMatch(result.pic.status === 'matched' ? result.pic.match : null);
      }
      if (nothingSent) {
        setNothingToSave(true);
      } else {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 4000);
      }
    } else if (result.error === 'picConfirmationRequired') {
      setPendingMatch(result.match);
    } else if (result.error === 'picRateLimited') {
      setPendingMatch(null);
      setPicRetryMinutes(Math.ceil(result.retryAfterSeconds / 60));
      setPicError('rateLimited');
      picInputRef.current?.focus();
    } else if (result.error === 'picInvalid' || result.error === 'picTaken') {
      setPendingMatch(null);
      setPicError(result.error === 'picInvalid' ? 'invalid' : 'taken');
      picInputRef.current?.focus();
    } else if (result.error === 'trlRangeConflict') {
      setPendingMatch(null);
      const [rowMin, rowMax] = result.trlRange;
      if (rowMin === stored.trlMin && rowMax === stored.trlMax) {
        // Nobody moved the range: the user's own numbers are the problem, and they stay to be fixed.
        setTrlError(t('errorInvalid'));
      } else {
        // The fields go back to the row, or the same refusal would hold up the next save and any PIC
        // in it. The message keeps the range the user typed; every other draft stays in its field.
        // FO-393 (N3). The row refuses one end only (the action says so); that end is the one the
        // user typed, the other was never theirs.
        setTrlError(
          t('errorTrlConflict', {
            min: rowMin,
            max: rowMax,
            end: sent.trlMin !== undefined ? 'min' : 'max',
            typed: sent.trlMin ?? sent.trlMax ?? trlMax,
          }),
        );
        setStored((known) => ({ ...known, trlMin: rowMin, trlMax: rowMax }));
        setTrlMin(rowMin);
        setTrlMax(rowMax);
      }
    } else if (
      result.error === 'invalid' &&
      !initial &&
      (capabilities === '' || keywords === '')
    ) {
      // B3. The server found no row to add to: the first profile needs both texts. Only an empty
      // field, the one `required` points at; anything else gets the message below.
      setPendingMatch(null);
      setNoRowSaid(true);
      setAskValidity((n) => n + 1);
    } else {
      setPendingMatch(null);
      const errorMessages: Record<string, string> = {
        forbidden: t('errorForbidden'),
        invalid: t('errorInvalid'),
        failed: t('errorFailed'),
        pilotExpired: t('errorPilotExpired'),
      };
      setError(errorMessages[result.error] || t('errorGeneric'));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await save();
  };

  const picIsSaved = pic !== '' && pic === savedPic;

  return (
    <div className="max-w-4xl mx-auto py-8 sm:px-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-medium text-muted mb-4">
        <Link href={getWorkspaceRoute('dashboard', locale, workspace)} className="hover:text-ink transition-colors">
          {t('breadcrumbDashboard')}
        </Link>
        <span>/</span>
        <Link href={getWorkspaceRoute('settingsModules', locale, workspace)} className="hover:text-ink transition-colors">
          {t('breadcrumbSettings')}
        </Link>
        <span>/</span>
        <span className="text-accent font-semibold">{t('breadcrumbCurrent')}</span>
      </div>

      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-heading text-ink">
            {t('title')}
          </h1>
          <p className="text-xs md:text-sm text-muted mt-1 max-w-2xl">
            {t('description')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={getWorkspaceRoute('settingsBilling', locale, workspace)}
            className="text-xs font-semibold text-ink-2 bg-surface hover:bg-surface-hover border border-border px-3 py-2 rounded-lg transition shadow-2xs"
          >
            {t('buttonBilling')}
          </Link>
          <Link
            href={getWorkspaceRoute('settingsApiKeys', locale, workspace)}
            className="text-xs font-semibold text-accent-ink bg-accent/10 hover:bg-accent/20 border border-accent/30 px-3 py-2 rounded-lg transition shadow-2xs"
          >
            {t('buttonApiKeys')}
          </Link>
        </div>
      </div>

      {savedSuccess && (
        <div className="mb-6 p-4 rounded-xl bg-ok/10 border border-ok/30 text-ok flex items-center gap-3 text-xs font-semibold animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-ok shrink-0" />
          <span>{t('successMessage')}</span>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-bad/10 border border-bad/30 text-bad flex items-center gap-3 text-xs font-semibold animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-bad shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form ref={formRef} onSubmit={handleSave} className="space-y-6 bg-surface p-6 md:p-8 rounded-2xl border border-border shadow-xs">
        <div>
          <label htmlFor={capabilitiesId} className="block text-xs font-bold uppercase tracking-wider text-ink mb-1.5 flex items-center gap-2">
            <Building className="w-3.5 h-3.5 text-accent" />
            <span>{t('capabilitiesLabel')}</span>
          </label>
          <textarea
            id={capabilitiesId}
            required={capabilitiesRequired}
            rows={5}
            value={capabilities}
            onChange={(e) => setCapabilities(e.target.value)}
            className="w-full bg-ground border border-border p-3 rounded-xl text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent leading-relaxed"
            placeholder={t('capabilitiesPlaceholder')}
          />
          <p className="text-[11px] text-muted mt-1">
            {t('capabilitiesHelper')}
          </p>
        </div>

        <div>
          <label htmlFor={keywordsId} className="block text-xs font-bold uppercase tracking-wider text-ink mb-1.5 flex items-center gap-2">
            <Key className="w-3.5 h-3.5 text-accent" />
            <span>{t('keywordsLabel')}</span>
          </label>
          <input
            id={keywordsId}
            type="text"
            name="keywords"
            required={keywordsRequired}
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            className="w-full bg-ground border border-border p-3 rounded-xl text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder={t('keywordsPlaceholder')}
          />
        </div>

        <div data-testid="tenant-pic-setting">
          <label
            htmlFor={picInputId}
            className="block text-xs font-bold uppercase tracking-wider text-ink mb-1.5 flex items-center gap-2"
          >
            <Fingerprint className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
            <span>{t('picLabel')}</span>
          </label>
          <input
            id={picInputId}
            ref={picInputRef}
            type="text"
            name="pic"
            inputMode="numeric"
            autoComplete="off"
            maxLength={40}
            data-testid="tenant-pic-input"
            value={pic}
            aria-describedby={`${picHelpId} ${picFeedbackId}`}
            aria-invalid={picError ? true : undefined}
            onChange={(e) => {
              setPic(e.target.value);
              setPicError(null);
              setPendingMatch(null);
              setPicCleared(false);
            }}
            className="w-full sm:max-w-xs min-h-11 bg-ground border border-border p-3 rounded-xl text-xs text-ink font-mono placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder={t('picPlaceholder')}
          />
          <p id={picHelpId} className="text-[11px] text-muted mt-1">
            {t.rich('picHelper', {
              register: (chunks) => (
                <a
                  href={PARTICIPANT_REGISTER_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-ink underline underline-offset-2"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>

          <div id={picFeedbackId} data-testid="tenant-pic-feedback" className="mt-2 text-xs">
            {picError && (
              <p role="alert" className="font-semibold text-bad flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>
                  {picError === 'invalid' && t('picErrorInvalid')}
                  {picError === 'rateLimited' && t('picErrorRateLimited', { minutes: picRetryMinutes })}
                  {picError === 'taken' &&
                    t.rich('picErrorTaken', {
                      email: supportEmail,
                      support: (chunks) => (
                        <a href={`mailto:${supportEmail}`} className="underline underline-offset-2 break-all">
                          {chunks}
                        </a>
                      ),
                    })}
                </span>
              </p>
            )}
            {!picError && picCleared && <p role="status" className="text-ink-2">{t('picClearedNotice')}</p>}
            {!picError && !pendingMatch && picIsSaved && savedPicMatch && (
              <p role="status" className="text-ok font-semibold">
                {t('picMatchedNotice', { name: savedPicMatch.name })}
              </p>
            )}
            {!picError && !pendingMatch && picIsSaved && !savedPicMatch && (
              <p role="status" className="text-ink-2">{t('picUnmatchedNotice')}</p>
            )}
          </div>

          {pendingMatch && (
            <div
              ref={confirmRef}
              tabIndex={-1}
              role="group"
              aria-labelledby={`${picFeedbackId}-confirm`}
              data-testid="tenant-pic-confirm"
              className="mt-3 p-4 bg-ground border border-accent/40 rounded-xl space-y-3 focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <div id={`${picFeedbackId}-confirm`} className="space-y-1">
                <p className="text-xs font-semibold text-ink">{t('picConfirmTitle')}</p>
                <p className="text-sm font-bold text-ink break-words">{pendingMatch.name}</p>
                {placeOf(pendingMatch) && <p className="text-xs text-muted">{placeOf(pendingMatch)}</p>}
                <p className="text-[11px] text-muted">{t('picConfirmWarning')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="tenant-pic-confirm-yes"
                  disabled={saving}
                  onClick={() => void save(pic)}
                  className="min-h-11 bg-accent text-white font-semibold text-xs py-2.5 px-4 rounded-xl hover:opacity-90 transition disabled:opacity-50 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {t('picConfirmYes')}
                </button>
                <button
                  type="button"
                  data-testid="tenant-pic-confirm-no"
                  disabled={saving}
                  onClick={() => {
                    setPendingMatch(null);
                    picInputRef.current?.focus();
                  }}
                  className="min-h-11 bg-surface text-ink-2 font-semibold text-xs py-2.5 px-4 rounded-xl border border-border hover:bg-surface-hover transition disabled:opacity-50 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {t('picConfirmNo')}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 bg-ground border border-border rounded-xl">
            <label htmlFor={trlMinId} className="block text-xs font-bold text-ink mb-1">
              {t('trlMinLabel')}
            </label>
            <input
              id={trlMinId}
              type="number"
              min="1"
              max="9"
              value={trlMin}
              onChange={(e) => {
                setTrlMin(Number(e.target.value));
                // FO-393 (N3). The message was about the numbers that are being rewritten now.
                setTrlError('');
              }}
              className="w-full bg-surface border border-border p-2.5 rounded-lg text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent font-mono font-bold"
            />
            <p className="text-[10px] text-muted mt-1">
              {t('trlMinDescription')}
            </p>
          </div>

          <div className="p-4 bg-ground border border-border rounded-xl">
            <label htmlFor={trlMaxId} className="block text-xs font-bold text-ink mb-1">
              {t('trlMaxLabel')}
            </label>
            <input
              id={trlMaxId}
              type="number"
              min="1"
              max="9"
              value={trlMax}
              onChange={(e) => {
                setTrlMax(Number(e.target.value));
                // FO-393 (N3). The message was about the numbers that are being rewritten now.
                setTrlError('');
              }}
              className="w-full bg-surface border border-border p-2.5 rounded-lg text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent font-mono font-bold"
            />
            <p className="text-[10px] text-muted mt-1">
              {t('trlMaxDescription')}
            </p>
          </div>
        </div>

        {trlError && (
          <p
            ref={trlErrorRef}
            tabIndex={-1}
            role="alert"
            data-testid="tenant-trl-error"
            className="p-4 rounded-xl bg-bad/10 border border-bad/30 text-bad flex items-start gap-3 text-xs font-semibold scroll-mt-4 focus:outline-none focus:ring-2 focus:ring-bad"
          >
            <AlertCircle className="w-4 h-4 text-bad shrink-0" aria-hidden="true" />
            <span>{trlError}</span>
          </p>
        )}

        {/* Beside the button, like the TRL message: the banner above the form can be off screen here. */}
        {nothingToSave && (
          <p
            role="status"
            data-testid="tenant-profile-no-changes"
            className="p-4 rounded-xl bg-ground border border-border text-ink-2 flex items-start gap-3 text-xs font-semibold"
          >
            <CheckCircle className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
            <span>{t('noChangesMessage')}</span>
          </p>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-accent text-white font-semibold text-xs py-2.5 px-6 rounded-xl hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2 shadow-2xs cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {saving ? t('savingButton') : t('saveButton')}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}
