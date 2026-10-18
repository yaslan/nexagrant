---
sözleşme: 3
görev: TASK-MVBDA0HX20X2C
kod: TASK-MVBDA0HX20X2C
ajan: se-fb
motor: claude
tip: karar
okur: ekip
hüküm: Bitti: crw2-fb incelemesindeki M1–M3 ve D1–D5 düzeltmeleri uygulandı; i18n:check, lint (0 hata) ve typecheck temiz; tr+en ekran görüntüsü alındı. PR #81 üzerine commit eklendi, merge edilmedi.
platform: mac (darwin) — yerel dev sunucusu (localhost:3000) + yerel Postgres; değişiklik metin/dokümandır, platforma bağlı kod yolu yok. Windows/Linux koşulmadı (davranış farkı üretmez).
sürüm: 2
tarih: 2026-10-17
---

# FO-10 — RLS iddiası metinlerini ölçülen duruma hizalama (düzeltme turu 2)

## Ne yapıldı
İnceleme raporu `docs/agent-results/TASK-MVBDA0HX20X2C-crw2-fb.md` (hüküm: DÜZELTME GEREKLİ) baştan sona uygulandı:

- **M1** `docs/legal/processing-register.md:22` (§1 hesap/kimlik): "Sistem-geneli tablolar (RLS kapsamı dışı); kullanıcı kaydına erişim oturum sahibinin kimliğiyle sınırlı; JWT oturum; `Session`/`Account` dışa aktarıma dahil değil".
- **M2** Gizlilik `securityBody` (`messages/{tr,en}.json:847`), DPA (`dpa-{tr,en}.md:61`), kullanıcı kılavuzu (`BETA_GUIDE{,.en}.md`): "her sorgu" → "kiracı verisine erişen sorgular kiracı kimliğiyle sınırlanır; yetkili platform yönetimi işlemleri denetim kaydıyla (AuditEvent) kiracılar arası çalışabilir" (tr ve en eşit anlamda).
- **M3** Envanterde kalan yedi yalın "RLS" tedbiri (`processing-register.md:36,78,106,134,148,193,279`) "kiracı filtresi (`withTenant`); RLS politikası tanımlı, uygulama bağlantısında etkin değil" kalıbına çevrildi. `:279`'daki "FORCE" ifadesi kaldırıldı (FORCE, SUPERUSER/BYPASSRLS rolünü bağlamaz).
- **D1** "henüz etkin değildir / not yet" → "etkin değildir / not in effect" (messages, DPA, BETA_GUIDE, HUKUK 1.13 notu).
- **D2** Ölçüm dayanağı açıklandı: `privacy-notice-gap-analysis.md:37` → "dayanak: Açık karar #16; yerel ölçüm 2026-10-17" (ROADMAP:104,159 ile tutarlı).
- **D3** `HUKUK-SORULARI-2026-09.md:3` başlık "Sürüm 1.12 · 29.09.2026" → "Sürüm 1.13 · 17.10.2026".
- **D5** tr + en ekran görüntüsü alındı (aşağıda). D4 (`SECURITY_COMPLIANCE.md`, iç belge) isteğe bağlı olduğu için değişmedi.

## Kanıt (ham çıktı)

`pnpm i18n:check`:
```
✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
```

`pnpm typecheck` → `tsc --noEmit`, exit 0.

`pnpm lint` → exit 0, `✖ 4 problems (0 errors, 4 warnings)` (uyarılar değişmeyen kod dosyalarında; bu işte kod dosyası değişmedi).

Kalan iddia taraması (`messages/`, `docs/legal/`, `docs/BETA_GUIDE*.md`):
```
henüz etkin / not yet in effect / her sorgu / every query → eşleşme yok
"ölçüm 2026-10-17)" → yalnız dayanak cümlesinde (privacy-notice-gap-analysis.md:37)
```

Ekran görüntüleri (`pnpm dev` + Playwright, `/tr/privacy` ve `/en/privacy` §7 "Güvenlik ve Depolama"):
- `docs/agent-results/TASK-MVBDA0HX20X2C-shots/privacy-tr-security.png`
- `docs/agent-results/TASK-MVBDA0HX20X2C-shots/privacy-en-security.png`

Görüntülerde yeni metin render oluyor (tr: "…diğer kiracılardan ayrılır: kiracı verisine erişen sorgular…"; en: "…queries that access tenant data are restricted…"). Çerez banneri alt sol köşede metni kısmen kapatıyor; metin okunabiliyor.

## Değişen dosyalar
- `messages/tr.json`, `messages/en.json` (securityBody)
- `docs/legal/dpa-tr.md`, `docs/legal/dpa-en.md`
- `docs/BETA_GUIDE.md`, `docs/BETA_GUIDE.en.md`
- `docs/legal/processing-register.md`
- `docs/legal/privacy-notice-gap-analysis.md`
- `docs/legal/HUKUK-SORULARI-2026-09.md`
- `docs/agent-results/TASK-MVBDA0HX20X2C-se-fb-2.md` (bu rapor; önceki v2 içeriği git geçmişinde, `32957647`)
- `docs/agent-results/TASK-MVBDA0HX20X2C-shots/*.png`

Kod davranışı değişmedi.

## Kararlar (kullanıcı onayı beklenmeden alındı)
- `PRIVACY_NOTICE.version` (`src/lib/legal/consent-documents.ts`) `2026-10-17.1` olarak bırakıldı. Gerekçe: bu PR henüz merge edilmedi, `2026-10-17.1` hiçbir kullanıcıya gösterilmedi/kaydedilmedi; aynı PR içindeki ikinci metin düzeltmesi yeni bir sürüm kaydı gerektirmez. Merge öncesi tekrar gözden geçirilmeli.
- Kart DoD'si "PR açıldı" diyor; PR #81 zaten açık, bu commit onun üzerine eklendi (force-push yok).
- `AuditEvent` terimi kullanıcıya görünen metinde, inceleme raporunun önerdiği şekliyle bırakıldı.

## Riskler
- K-489304 "B" seçilirse metin ölçüm geçene kadar düzeltilmiş kalır; geçiş yapılınca metin yeniden gözden geçirilmeli.
- Hukuki yeterlilik (DPA'da yalnız uygulama katmanı yalıtımı) hukukçu sorusu olarak HUKUK 1.13'te açık; bu rapor hukuki görüş vermez.
- Kapsam dışı, ayrı kart önerilir: `docs/DATA_MODEL.md:981` "Canlı uygulama `fabrika_app` ile bağlanır" ifadesi Açık karar #16 ile çelişiyor.

## Açık sorular
- Yok (metin kararları yukarıdaki gibi uygulandı).

## Sonraki adım
- crw2-fb yeniden inceleme (PR #81 head güncellendi). Merge edilmedi; patron/ürün onayı ve K-489304 sonucu beklenir.
