import { describe, expect, test } from 'vitest';

import {
  DIRECT_SIGN_DOCUMENT_KINDS,
  DUAL_APPROVAL_DOCUMENT_KINDS,
  FOLLOWUP_DOC_KINDS,
  FollowupDocKindSchema,
  documentKindRequiresDualApproval,
  knownDocumentKind,
} from '@/lib/followup-doc-kinds';
import * as rbac from '@/lib/rbac';

/**
 * İNCELEME-65 B-1 / D-1. The lists are written out here, not read from the
 * module under test: emptying `DUAL_APPROVAL_DOCUMENT_KINDS` must turn this
 * file red, not make its cases disappear.
 */

// "NDA" + ZERO WIDTH SPACE, "NDA" with a Cyrillic А (U+0410), full-width "ＮＤＡ".
const ZWSP_NDA = 'NDA​';
const CYRILLIC_NDA = 'NDА';
const FULLWIDTH_NDA = 'ＮＤＡ';

describe('follow-up document kinds', () => {
  test('the lists are exactly what the owner decided', () => {
    expect(FOLLOWUP_DOC_KINDS).toEqual(['NDA', 'LOI', 'COMMITMENT', 'ESR_DEBRIEF', 'AWARD_PACK']);
    expect(DUAL_APPROVAL_DOCUMENT_KINDS).toEqual(['NDA', 'LOI', 'COMMITMENT']);
    expect(DIRECT_SIGN_DOCUMENT_KINDS).toEqual(['ESR_DEBRIEF', 'AWARD_PACK']);
  });

  test('rbac re-exports the same gate', () => {
    expect(rbac.DUAL_APPROVAL_DOCUMENT_KINDS).toBe(DUAL_APPROVAL_DOCUMENT_KINDS);
    expect(rbac.documentKindRequiresDualApproval).toBe(documentKindRequiresDualApproval);
  });

  test.each(['NDA', 'LOI', 'COMMITMENT'])('%s needs the dual approval flow', (kind) => {
    expect(documentKindRequiresDualApproval(kind)).toBe(true);
  });

  test.each(['ESR_DEBRIEF', 'AWARD_PACK'])('%s is signed directly', (kind) => {
    expect(documentKindRequiresDualApproval(kind)).toBe(false);
  });

  // The seven spellings crw-fb signed without the flow (A1), plus two it did not try.
  test.each(['nda', 'Nda', 'NDA ', ' NDA', 'loi', 'Commitment', ZWSP_NDA, FULLWIDTH_NDA, '\tLOI\n'])(
    'the variant %j is the legal kind it spells and needs the flow',
    (kind) => {
      expect(knownDocumentKind(kind)).not.toBeNull();
      expect(documentKindRequiresDualApproval(kind)).toBe(true);
    }
  );

  // Fail-closed: a spelling nobody knows is not signed directly.
  test.each([CYRILLIC_NDA, 'N D A', 'NDA_V2', 'CONTRACT', '', 'ESR DEBRIEF'])(
    'the unknown kind %j needs the flow too',
    (kind) => {
      expect(knownDocumentKind(kind)).toBeNull();
      expect(documentKindRequiresDualApproval(kind)).toBe(true);
    }
  );

  test('a direct kind spelled with padding stays a direct kind', () => {
    expect(documentKindRequiresDualApproval(' esr_debrief ')).toBe(false);
  });

  test('the write-side schema takes the exact kinds only', () => {
    for (const kind of FOLLOWUP_DOC_KINDS) expect(FollowupDocKindSchema.safeParse(kind).success).toBe(true);
    for (const kind of ['nda', 'NDA ', ' NDA', 'loi', 'Commitment', ZWSP_NDA, CYRILLIC_NDA, FULLWIDTH_NDA, '', 'PART_B']) {
      expect(FollowupDocKindSchema.safeParse(kind).success).toBe(false);
    }
  });
});
