import { describe, test, expect } from 'vitest';
import { submitForDualApproval, approveByDepartment, rejectDualApproval } from '../src/lib/dual-approval';

describe('Boşluk 4: Çift Onaylı Kurumsal Yetki Akışı (Dual Approval Workflow)', () => {
  test('submitForDualApproval initializes document in PENDING_FINANCE_APPROVAL stage', () => {
    const state = submitForDualApproval('doc-101', 'Dr. Mehmet Yılmaz');

    expect(state.docId).toBe('doc-101');
    expect(state.stage).toBe('PENDING_FINANCE_APPROVAL');
    expect(state.financeApproved).toBe(false);
    expect(state.legalApproved).toBe(false);
    expect(state.auditTrail.length).toBe(1);
  });

  test('approveByDepartment FINANCE advances stage to PENDING_LEGAL_APPROVAL', () => {
    const initial = submitForDualApproval('doc-102');
    const financeApproved = approveByDepartment(initial, 'FINANCE', 'Finans Müdürü Ali Bey');

    expect(financeApproved.stage).toBe('PENDING_LEGAL_APPROVAL');
    expect(financeApproved.financeApproved).toBe(true);
    expect(financeApproved.financeApprover).toBe('Finans Müdürü Ali Bey');
  });

  test('approveByDepartment LEGAL completes approval pipeline to APPROVED_AND_SIGNED', () => {
    const initial = submitForDualApproval('doc-103');
    const step1 = approveByDepartment(initial, 'FINANCE', 'Finans Müdürü Ali Bey');
    const step2 = approveByDepartment(step1, 'LEGAL', 'Av. Ayşe Hanım');

    expect(step2.stage).toBe('APPROVED_AND_SIGNED');
    expect(step2.legalApproved).toBe(true);
    expect(step2.legalApprover).toBe('Av. Ayşe Hanım');
    expect(step2.auditTrail.length).toBe(3);
  });

  test('rejectDualApproval sets stage to REJECTED with audit note', () => {
    const initial = submitForDualApproval('doc-104');
    const rejected = rejectDualApproval(initial, 'FINANCE', 'Finans Müdürü Ali Bey', 'Bütçe kalemi eksik');

    expect(rejected.stage).toBe('REJECTED');
    expect(rejected.auditTrail.some(l => l.note?.includes('Bütçe kalemi eksik'))).toBe(true);
  });
});
