---
name: fabrika-no-sentry-systemalert-decision
description: Patron kararı 2026-09-07 — Fabrika'da Sentry KULLANILMAYACAK; hata/geri bildirim izleme kendi SystemAlert tablosu + /admin/alerts ekranı üzerinden yürüyor
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

Uygulama kartı: TASK-MTQUN8VV6DK8C (geli-tirici). Açık güvenlik kararı: `SystemAlert`
tenantId TAŞIMIYOR, ama geri bildirim uyarıları kiracı verisi içeriyor — ya modele
tenantId + RLS eklenecek ya da meta'da yalnız feedbackId referansı kalacak.

İlgili: [[fabrika-g0-score-never-computed]]
