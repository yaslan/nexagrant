import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  APPROVAL_REQUEST_ERRORS,
  APPROVAL_TITLE_MAX,
  effectiveApprovalStatus,
} from '@/lib/approval-request-rules';
import { validateCreateInput } from '@/lib/approval-requests';

/**
 * AKTAR-MURBCJ0A-1 — the approvals screen's pure rules. The database half is in
 * tests/approval-requests.live.test.ts.
 */

const base = { actionType: 'BUDGET_ALLOCATION', title: 'Bütçe', payload: { a: 1 } };

describe('validateCreateInput', () => {
  test('a valid request gets the action type floor and the 48 h default', () => {
    expect(validateCreateInput(base)).toEqual({
      ok: true,
      value: {
        actionType: 'BUDGET_ALLOCATION',
        title: 'Bütçe',
        description: null,
        payload: { a: 1 },
        requiredRole: 'TENANT_ADMIN',
        expiresInHours: 48,
      },
    });
  });

  test('the title is trimmed, and its limit is inclusive', () => {
    const r = validateCreateInput({ ...base, title: `  ${'x'.repeat(APPROVAL_TITLE_MAX)}  ` });
    expect(r.ok && r.value.title.length).toBe(APPROVAL_TITLE_MAX);
    expect(validateCreateInput({ ...base, title: 'x'.repeat(APPROVAL_TITLE_MAX + 1) })).toEqual({ ok: false, error: 'titleTooLong' });
  });

  test('a requester may raise the required role, never lower it', () => {
    const raised = validateCreateInput({ ...base, requiredRole: 'TENANT_OWNER' });
    expect(raised.ok && raised.value.requiredRole).toBe('TENANT_OWNER');
    expect(validateCreateInput({ ...base, requiredRole: 'MEMBER' })).toEqual({ ok: false, error: 'invalidRequiredRole' });
    expect(validateCreateInput({ ...base, requiredRole: 'ROOT' })).toEqual({ ok: false, error: 'invalidRequiredRole' });
  });

  test('wire-shaped garbage is refused, not coerced', () => {
    expect(validateCreateInput({ ...base, actionType: '__proto__' })).toEqual({ ok: false, error: 'invalidActionType' });
    expect(validateCreateInput({ ...base, title: 42 })).toEqual({ ok: false, error: 'titleRequired' });
    expect(validateCreateInput({ ...base, payload: null })).toEqual({ ok: false, error: 'invalidPayload' });
    expect(validateCreateInput({ ...base, payload: 'str' })).toEqual({ ok: false, error: 'invalidPayload' });
    expect(validateCreateInput({ ...base, expiresInHours: 1.5 })).toEqual({ ok: false, error: 'invalidExpiry' });
    expect(validateCreateInput({ ...base, expiresInHours: '48' })).toEqual({ ok: false, error: 'invalidExpiry' });
  });
});

describe('effectiveApprovalStatus', () => {
  const now = new Date('2026-10-02T12:00:00Z');
  test('a PENDING row past expiresAt reads as EXPIRED; others keep their status', () => {
    expect(effectiveApprovalStatus('PENDING', '2026-10-02T11:59:59Z', now)).toBe('EXPIRED');
    expect(effectiveApprovalStatus('PENDING', '2026-10-02T12:00:01Z', now)).toBe('PENDING');
    expect(effectiveApprovalStatus('APPROVED', '2020-01-01T00:00:00Z', now)).toBe('APPROVED');
  });
});

describe('every refusal code has copy in both locales, spelled exactly as the code', () => {
  for (const locale of ['tr', 'en']) {
    test(locale, () => {
      const messages = JSON.parse(readFileSync(resolve(process.cwd(), `messages/${locale}.json`), 'utf8'));
      const errors = messages.Approvals.errors as Record<string, string>;
      expect(Object.keys(errors).sort()).toEqual([...APPROVAL_REQUEST_ERRORS].sort());
      for (const code of APPROVAL_REQUEST_ERRORS) expect(errors[code]?.trim(), code).toBeTruthy();
    });
  }
});
