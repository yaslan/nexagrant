'use server';

import { withTenant } from '@/lib/db';
import { requireTenantAction } from '@/lib/tenant';
import { generateText } from '@/lib/llm';
import { isLlmUnusableOutcome } from '@/lib/llm-outcome';
import { separatedPrompt } from '@/lib/ai/prompts';
import { promptLocale } from '@/lib/ai/prompts/locale';
import { assertModuleAccess } from '@/lib/modules/access';
import { revalidatePath } from 'next/cache';
import { createTranslator } from 'next-intl';
import { errorMessage } from '@/lib/errors';
import type { TtoPortfolioItemRow } from '@/types/db-rows';
import trMessages from '../../../../messages/tr.json';
import enMessages from '../../../../messages/en.json';

const TTO_MESSAGES = { tr: trMessages, en: enMessages };

/**
 * M7 TTO portfolio.
 *
 * `tenantId`/`userId` used to be arguments supplied by the TTO client
 * component. A server action is a public POST endpoint, so those were
 * attacker-controlled — a portfolio item could be written into, and an AI
 * call billed to, any tenant. Both now come from the session.
 */

export async function createTtoItem({
  title,
  trl,
  patentStatus,
  summary,
  keywords,
}: {
  title: string;
  trl: number;
  patentStatus: string;
  summary: string;
  keywords: string[];
}) {
  await assertModuleAccess('M7');
  const { tenantId } = await requireTenantAction({ can: 'edit_proposal' });

  const item = await withTenant<TtoPortfolioItemRow>(tenantId, (tx) =>
    tx.ttoPortfolioItem.create({
      data: {
        tenantId,
        title,
        trl,
        patentStatus,
        summary,
        keywords,
      },
    })
  );

  try {
    revalidatePath('/[locale]/(app)/[workspace]/tto', 'page');
  } catch {}

  return item;
}

export async function matchTtoItemToCalls(itemId: string) {
  // The page gate is not enough: an action is a public POST endpoint, callable
  // with M7 off or outside the plan (TASK-MUUS5HE3OW0CT).
  await assertModuleAccess('M7');
  // Reads only (TASK-MUN80UOUPB2A4): nothing here is written, so an expired
  // pilot may still see it and no edit permission is needed.
  const { tenantId } = await requireTenantAction({ readOnly: true });

  // Scoped read: a portfolio item id from another tenant must not resolve here.
  const item = await withTenant<{ title: string; trl: number } | null>(tenantId, (tx) =>
    tx.ttoPortfolioItem.findFirst({
      where: { id: itemId, tenantId },
      select: { title: true, trl: true },
    })
  );

  if (!item) return { matchedTopics: [] };

  return { matchedTopics: [] };
}

export async function generateIpChecklist({
  title,
  trl,
  patentStatus,
}: {
  title: string;
  trl: number;
  patentStatus: string;
}) {
  // Module gate: refuse before any side effect — an LLM call writes AiUsageLog
  // and debits CreditLedger, so a closed module checked later still costs credits.
  await assertModuleAccess('M7');
  const { tenantId, userId } = await requireTenantAction({ can: 'edit_proposal' });

  const locale = await promptLocale();

  const request = separatedPrompt(
    'm7/ip-checklist',
    {},
    { technology_title: title, current_trl: trl, patent_status: patentStatus },
    locale
  );

  let content = '';
  try {
    content = await generateText({
      tenantId,
      userId,
      module: 'M7',
      purpose: 'tto_ip_checklist',
      ...request,
    });
  } catch (e) {
    // A cut-off or declined answer must reach the screen as such, not be
    // papered over with the canned list below (TASK-MUN4PSBP19RKK).
    if (isLlmUnusableOutcome(e)) throw e;
    console.warn('[generateIpChecklist] LLM fallback:', errorMessage(e));
    // The canned list is shown to the user, so it is UI copy in the user's
    // locale, not a prompt. createTranslator rather than getTranslations: it
    // needs no next-intl request config, so the unit tests reach it too.
    const t = createTranslator({ locale, messages: TTO_MESSAGES[locale], namespace: 'm7.tto' });
    content = t('ipChecklistFallback', {
      patentStatus: patentStatus.toUpperCase(),
      trl,
      nextTrl: Math.min(9, trl + 2),
    });
  }

  return { success: true, checklistContent: content };
}
