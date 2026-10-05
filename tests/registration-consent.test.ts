import { describe, expect, test } from 'vitest';

import {
  PRIVACY_NOTICE,
  REGISTRATION_DOCUMENTS,
  TERMS_OF_SERVICE,
  acknowledgementMatchesCurrent,
  registrationAcknowledgementToken,
  registrationConsentRows,
} from '../src/lib/legal/consent-documents';

/**
 * TASK-MTSWLANXSU0IG (A3) — the rules a disclosure record has to obey, with no
 * database in the way. The live half (atomicity, RLS) is in
 * tests/registration-consent.live.test.ts.
 */
describe('registration disclosure documents', () => {
  test('registration records a disclosure and a terms acceptance — never a consent', () => {
    // The register decides this, not preference. docs/legal/processing-register.md
    // §1 puts account creation on KVKK md.5/2-c / GDPR art.6(1)(b) — the
    // contract. A row stamped EXPLICIT_CONSENT here would state, on the record,
    // that we rely on art.6(1)(a) for something we do not, and would imply a
    // withdrawal right that contract-basis processing does not carry.
    const kinds = REGISTRATION_DOCUMENTS.map((d) => d.kind);
    expect(kinds).toEqual(['DISCLOSURE_ACK', 'TERMS_ACCEPTANCE']);
    expect(kinds).not.toContain('EXPLICIT_CONSENT');
  });

  test('every registration document is versioned', () => {
    // A row that stores a document id with no version cannot answer the only
    // question that matters when the text changes: which text was it?
    for (const doc of REGISTRATION_DOCUMENTS) {
      expect(doc.version, `${doc.id} has no version`).toMatch(/\S/);
    }
  });

  test('one row per document, carrying the version rather than the text', () => {
    const rows = registrationConsentRows({
      tenantId: 'tenant-1',
      userId: 'user-1',
      locale: 'tr',
    });

    expect(rows).toHaveLength(REGISTRATION_DOCUMENTS.length);
    expect(rows.map((r) => r.documentId)).toEqual([PRIVACY_NOTICE.id, TERMS_OF_SERVICE.id]);
    expect(rows.map((r) => r.documentVersion)).toEqual([
      PRIVACY_NOTICE.version,
      TERMS_OF_SERVICE.version,
    ]);

    for (const row of rows) {
      expect(row.tenantId).toBe('tenant-1');
      expect(row.userId).toBe('user-1');
      expect(row.purpose).toBe('ACCOUNT_REGISTRATION');
      // The text is served from messages/*.json; a copy stored here would go
      // stale silently and then read as if it were current.
      expect(Object.keys(row)).not.toContain('text');
    }
  });

  test('a tick with no version stamp is not an acknowledgement', () => {
    expect(acknowledgementMatchesCurrent(undefined)).toBe(false);
    expect(acknowledgementMatchesCurrent('')).toBe(false);
    expect(acknowledgementMatchesCurrent(true)).toBe(false);
    expect(acknowledgementMatchesCurrent('true')).toBe(false);
    expect(acknowledgementMatchesCurrent('on')).toBe(false);
  });

  test('the current stamp is accepted', () => {
    expect(acknowledgementMatchesCurrent(registrationAcknowledgementToken())).toBe(true);
  });

  test('a stamp naming a superseded version is refused', () => {
    // The case this exists for: a registration form left open while the notice
    // is republished. The person read the old text. Accepting their tick would
    // write today's version against yesterday's reading — a record that looks
    // like proof and is not.
    const stale = registrationAcknowledgementToken().replace(
      PRIVACY_NOTICE.version,
      '1999-01-01.1'
    );
    expect(stale).not.toBe(registrationAcknowledgementToken());
    expect(acknowledgementMatchesCurrent(stale)).toBe(false);
  });

  test('the stamp names every document the box covers', () => {
    // If a third document is ever added to the box, the stamp has to grow with
    // it — otherwise the box says it covers three texts and the record proves
    // two.
    const token = registrationAcknowledgementToken();
    for (const doc of REGISTRATION_DOCUMENTS) {
      expect(token).toContain(`${doc.id}@${doc.version}`);
    }
  });

  test('both documents link into a page the app actually serves', () => {
    expect(PRIVACY_NOTICE.href('tr')).toBe('/tr/privacy');
    expect(TERMS_OF_SERVICE.href('en')).toBe('/en/terms');
  });
});
