---
name: fabrika-no-sentry-systemalert-decision
description: Patron kararı 2026-09-07 — Fabrika'da Sentry KULLANILMAYACAK; hata/geri bildirim izleme kendi SystemAlert tablosu + /admin/alerts ekranı üzerinden yürüyor (UYGULANDI)
metadata:
  type: project
  updatedAt: 2026-09-07
---

**Karar (patron, 2026-09-07):** Sentry kullanılmayacak. Hata ve geri bildirim izleme
tamamen kendi içimizde, mevcut `SystemAlert` tablosu üzerinden.

Gerekçe: veri dışarı çıkmasın (çok kiracılı Avrupa fonları SaaS'ı, KVKK/GDPR yüzeyi),
ek servis/bağımlılık/maliyet olmasın.

Değerlendirilip ELENEN seçenekler: GitHub Issues köprüsü (GitHub bağlı ama müşteri
geri bildirimi ekip deposunda görünürdü) · GlitchTip self-host (mevcut kod aynı
protokolü konuşuyor, DSN değişimiyle çalışırdı ama bakımı üstlenilecek bir servis daha).

Mimari zemin (ölçüldü): Sentry bu sistemde zaten yalnız "yükseltici"ydi — kayıt kaynağı
hep veritabanıydı. `src/lib/observability/sentry.ts` SDK kullanmıyordu, doğrudan envelope
HTTP uç noktasına yazıyordu; DSN boş/bozuksa 'skipped' dönüp sessizce devam ediyordu.
Bu yüzden sökmek veri kaybettirmiyor.

## UYGULANDI — TASK-MTQUN8VV6DK8C (geli-tirici, 2026-09-07)

Açık bırakılan güvenlik kararı **şöyle kapandı: `SystemAlert` kiracı-agnostik KALDI,
tenantId EKLENMEDİ.** Uyarıya kiracı içeriği yazılmıyor; yalnız RLS korumalı `Feedback`
satırına bir `feedbackId` referansı + kapalı kümeli sınıflandırma (priority/category/
impact/locale/triageReason/slaHours) konuyor. Ölçülen gerekçe: `SystemAlert`
`prisma/rls.sql`'in **iki listesinde de yok**, yani satır-seviyesi yalıtımı hiç yok
(`pnpm rls:check` de saymıyor). Oraya yazılan her şey yalıtım dışıdır → en az ayrıcalık,
hassas veriyi hiç yazmamak. Detaylı savunma:
`docs/agent-results/TASK-MTQUN8VV6DK8C-geli-tirici.md` §3.

Uygulama notları (kalıcı):
- Tek yazar `src/lib/observability/system-alert.ts` → `recordAlert()`. Asla fırlatmaz.
  `email|password|secret|token|apikey|authorization|credential|dsn|cookie` içeren meta
  anahtarlarını düşürür ve `redactedKeys` ile **görünür** kılar.
- Seviye eşlemesi: `SystemAlert.level` yalnız `info|warn|error` — **`fatal` YOK**.
  P0→error, P1→error, P2→warn, P3→info.
- `Feedback.sentryEventId/sentryStatus` → `alertId`/`alertStatus`. Eski dış-izleyici
  id'leri silinmedi: tek bir `SystemAlert` satırına (`source='feedback-migration'`)
  arşivlendi, `alertStatus='legacy'` yazıldı; `.down.sql` arşivi geri oynatıyor →
  round-trip **kayıpsız** (16→16 satır, değerler birebir).
- Ekran görüntüsü artık **yalnız R2**'de yaşıyor (dış servise ek olarak gitmiyor).
  Saklanamazsa kullanıcıya gönderim ekranında söyleniyor + `beta-feedback-screenshot`
  kaynaklı `warn` uyarısı yazılıyor. Sessiz kayıp yok.
- `src/lib/observability/sentry.ts` silindi. Onu anlatan
  `fabrika-sentry-envelope-without-sdk` hafızası da **silindi**: dosya artık yok ve
  yasaklı bir bağımlılığı yeniden kurmaya davet ediyordu. Protokol bilgisi gerekirse
  git geçmişinde (`0d1d6c8`'den önce).

İlgili: [[fabrika-post-commit-stamp-must-not-fail-request]] ·
[[fabrika-theme-tokens-not-dark-variant]] · [[fabrika-migrations-are-not-prisma-migrate]] ·
[[fabrika-g0-score-never-computed]]
