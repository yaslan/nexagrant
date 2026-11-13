import { describe, test, expect } from 'vitest';
import { switchLocalePath } from '../src/lib/routes';

// TASK-MUUS56953SPMX (B-1/B-3): the language switch maps every slug through the route
// table, it does not swap the /tr ↔ /en prefix. The query string is kept by the caller.
describe('switchLocalePath', () => {
  test('workspace settings page maps both segments', () => {
    expect(switchLocalePath('/tr/ws/ayarlar/profil', 'en')).toBe('/en/ws/settings/profile');
    expect(switchLocalePath('/en/ws/settings/profile', 'tr')).toBe('/tr/ws/ayarlar/profil');
    expect(switchLocalePath('/tr/ws/ayarlar/uyeler', 'en')).toBe('/en/ws/settings/members');
  });

  test('workspace top-level pages keep the workspace slug', () => {
    expect(switchLocalePath('/tr/ws/panel', 'en')).toBe('/en/ws/dashboard');
    expect(switchLocalePath('/en/ws/notifications', 'tr')).toBe('/tr/ws/bildirimler');
  });

  // FO-176: `kaynaklar` is a fixed page under Partners, not a PIC detail.
  test('partner resources page maps to its counterpart, not to a PIC', () => {
    expect(switchLocalePath('/tr/ws/ortaklar/kaynaklar', 'en')).toBe('/en/ws/partners/resources');
    expect(switchLocalePath('/en/ws/partners/resources', 'tr')).toBe('/tr/ws/ortaklar/kaynaklar');
    expect(switchLocalePath('/tr/ws/ortaklar/999999999', 'en')).toBe('/en/ws/partners/999999999');
  });

  test('public pages land on their counterpart, not on the home page', () => {
    expect(switchLocalePath('/tr/blog', 'en')).toBe('/en/blog');
    expect(switchLocalePath('/en/pricing', 'tr')).toBe('/tr/fiyatlandirma');
    expect(switchLocalePath('/tr/acik-cagrilar', 'en')).toBe('/en/open-calls');
  });

  // NG-127: posts are Turkish only (BLOG_CONTENT_LOCALE). Switching a TR post to EN
  // lands on the EN blog notice page; the TR→TR path and the 307 for /en/blog/<slug> stay.
  test('TR blog post switched to EN lands on the EN blog notice page', () => {
    expect(switchLocalePath('/tr/blog/ornek-yazi', 'en')).toBe('/en/blog');
  });

  test('blog post switched to TR keeps the slug', () => {
    expect(switchLocalePath('/en/blog/ornek-yazi', 'tr')).toBe('/tr/blog/ornek-yazi');
  });

  test('home and unknown paths fall back to the locale root', () => {
    expect(switchLocalePath('/tr', 'en')).toBe('/en');
    expect(switchLocalePath('', 'en')).toBe('/en');
    expect(switchLocalePath('/de/x', 'tr')).toBe('/tr');
  });
});
