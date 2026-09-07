import { describe, test, expect } from 'vitest';
import {
  submitForDualApproval,
  approveByDepartment,
  rejectDualApproval,
  MissingApprovalActorError,
  type ApprovalActor,
} from '../src/lib/dual-approval';

/**
 * TASK-MTR60M5ESB5PZ — the workflow used to default its actor to one real
 * person's name, so a call that named nobody produced an audit record naming
 * somebody who had never seen the document. These tests hold both halves of the
 * rule: no identity → no record, and every record carries the actor's `userId`
 * next to the display name.
 */
const SUBMITTER: ApprovalActor = { userId: 'demo-user-alice', displayName: 'Alice' };
const FINANCE: ApprovalActor = { userId: 'demo-user-bob', displayName: 'Finans Müdürü Ali Bey' };
const LEGAL: ApprovalActor = { userId: 'demo-user-carol', displayName: 'Av. Ayşe Hanım' };

describe('Boşluk 4: Çift Onaylı Kurumsal Yetki Akışı (Dual Approval Workflow)', () => {
  test('submitForDualApproval initializes document in PENDING_FINANCE_APPROVAL stage', () => {
    const state = submitForDualApproval('doc-101', SUBMITTER);

    expect(state.docId).toBe('doc-101');
    expect(state.stage).toBe('PENDING_FINANCE_APPROVAL');
    expect(state.financeApproved).toBe(false);
    expect(state.legalApproved).toBe(false);
    expect(state.auditTrail.length).toBe(1);
  });

  test('approveByDepartment FINANCE advances stage to PENDING_LEGAL_APPROVAL', () => {
    const initial = submitForDualApproval('doc-102', SUBMITTER);
    const financeApproved = approveByDepartment(initial, 'FINANCE', FINANCE);

    expect(financeApproved.stage).toBe('PENDING_LEGAL_APPROVAL');
    expect(financeApproved.financeApproved).toBe(true);
    expect(financeApproved.financeApprover).toBe('Finans Müdürü Ali Bey');
    expect(financeApproved.financeApproverUserId).toBe('demo-user-bob');
  });

  test('approveByDepartment LEGAL completes approval pipeline to APPROVED_AND_SIGNED', () => {
    const initial = submitForDualApproval('doc-103', SUBMITTER);
    const step1 = approveByDepartment(initial, 'FINANCE', FINANCE);
    const step2 = approveByDepartment(step1, 'LEGAL', LEGAL);

    expect(step2.stage).toBe('APPROVED_AND_SIGNED');
    expect(step2.legalApproved).toBe(true);
    expect(step2.legalApprover).toBe('Av. Ayşe Hanım');
    expect(step2.legalApproverUserId).toBe('demo-user-carol');
    expect(step2.auditTrail.length).toBe(3);
  });

  test('rejectDualApproval sets stage to REJECTED with audit note', () => {
    const initial = submitForDualApproval('doc-104', SUBMITTER);
    const rejected = rejectDualApproval(initial, 'FINANCE', FINANCE, 'Bütçe kalemi eksik');

    expect(rejected.stage).toBe('REJECTED');
    expect(rejected.auditTrail.some(l => l.note?.includes('Bütçe kalemi eksik'))).toBe(true);
  });
});

describe('the audit trail never names somebody who did not act', () => {
  test('every audit line carries the actor id next to the display name', () => {
    const submitted = submitForDualApproval('doc-201', SUBMITTER);
    const approved = approveByDepartment(submitted, 'FINANCE', FINANCE, 'Bütçe uygun');
    const rejected = rejectDualApproval(approved, 'LEGAL', LEGAL, 'Sözleşme maddesi eksik');

    expect(rejected.submittedBy).toBe('Alice');
    expect(rejected.submittedByUserId).toBe('demo-user-alice');
    for (const line of rejected.auditTrail) {
      expect(line.actorUserId, `audit line ${line.id} has no actor id`).toBeTruthy();
      expect(line.actorName, `audit line ${line.id} has no actor name`).toBeTruthy();
    }
    expect(rejected.auditTrail.map(l => l.actorUserId)).toEqual([
      'demo-user-alice',
      'demo-user-bob',
      'demo-user-carol',
    ]);
  });

  test('the state a real actor produces carries only that actor', () => {
    // The name the workflow used to fall back on, spelled out only here so the
    // assertion can prove it never reappears in a produced record.
    const FABRICATED = ['Dr.', 'Mehmet', 'Yılmaz'].join(' ');
    const state = submitForDualApproval('doc-202', SUBMITTER);
    expect(JSON.stringify(state)).not.toContain(FABRICATED);
  });

  // The regression itself: `submitForDualApproval('doc-x')` used to succeed and
  // sign the record with a name the caller never supplied. It must now refuse.
  test.each([
    ['no actor at all', undefined],
    ['a null actor', null],
    ['an actor with no userId', { userId: '', displayName: 'Alice' }],
    ['an actor with no display name', { userId: 'demo-user-alice', displayName: '   ' }],
  ])('submitForDualApproval refuses %s', (_label, actor) => {
    expect(() =>
      submitForDualApproval('doc-203', actor as unknown as ApprovalActor)
    ).toThrow(MissingApprovalActorError);
  });

  test('approveByDepartment and rejectDualApproval refuse an unidentified actor', () => {
    const state = submitForDualApproval('doc-204', SUBMITTER);
    const anonymous = undefined as unknown as ApprovalActor;

    expect(() => approveByDepartment(state, 'FINANCE', anonymous)).toThrow(
      MissingApprovalActorError
    );
    expect(() => rejectDualApproval(state, 'FINANCE', anonymous, 'sebep')).toThrow(
      MissingApprovalActorError
    );
  });
});
