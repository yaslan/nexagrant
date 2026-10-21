---
sözleşme: 3
görev: TASK-MVC91DFJDQ2E1
kod: FO-49
ajan: se-fb
motor: claude
tip: feature
okur: ekip
hüküm: Bitti (PR #94 dev'e açıldı, merge edilmedi). Ancak 1 yıl saklama metni koddan önde: ön kayıt verisini silen bir temizlik işi yok — patron/lider kararı bekleniyor.
platform: mac (darwin, zsh). Tarayıcı doğrulaması mac'te Playwright ile yapıldı. Windows/Linux koşulmadı: değişiklik yalnız metin, sürüm sabiti ve test; platforma bağlı kod yolu yok.
sürüm: 1
tarih: 2026-10-17
---

# FO-49 — KVKK uzman metni v2

## Ne yapıldı
- `content/kvkk-uzman-v2.md` ve `content/kvkk-uzman-v2.en.md` eklendi (v1 dosyaları denetim izi için duruyor).
  - §1 veri sorumlusu: **Fonbridge Eğitim, Proje ve Danışmanlık Ltd. Şti.** (placeholder kalktı).
  - §5 aktarım: yurt dışına aktarım yok; yurt içi barındırma ve e-posta sağlayıcıları. Rehber görünürlüğü lansmana bağlı, e-posta adresi herkese açık değil (metin, SSS'deki "Lansmana kadar hiç kimseye" cümlesiyle aynı; kodda lansman öncesi profil gösterimi yok).
  - §6 saklama: **1 yıl**, formu ilk gönderdiğiniz tarihten; doğrulanmamış kayıtlar için de aynı süre.
  - §7 haklar: rıza (duyuru e-postası, rehber yayını) geri alma yolu `info@fonbridge.com`.
- `EXPERT_PREREG_CONSENT_VERSION`: `kvkk-v1` → `kvkk-v2` (`src/lib/expert-prereg/server/constants.ts`). Eski satırlar `kvkk-v1` olarak kalır.
- Yükleyici (`kvkk-text.server.ts`), yorum (`kvkk-text.ts`), birim testi (`tests/expert-prereg-form.test.tsx`), e2e (`tests/e2e/expert-prereg.spec.ts`) v2'ye bağlandı.
- Unvan birliği: `docs/legal/dpa-tr.md`, `dpa-en.md` (tablo "Ticari unvan / Registered legal name"), `docs/EFATURA_SETUP.md:38`, `docs/EFATURA_INTEGRATOR_RFI.md`, `docs/MALI_MUSAVIR_SORULARI.md`, `docs/legal/agency-channel-notice-addendum.md`, `docs/legal/privacy-notice-gap-analysis.md`, `docs/legal/HUKUK-SORULARI-2026-09.md`, `.env.example` (yorum), `docs/DATA_MODEL.md` (sürüm).
- FO-10 (#81) önce: PR #81 başı (round 2, `1507dcc2`) incelemedeki M1–M3 bulgularını metinde karşılıyor (processing-register §1 "RLS kapsamı dışı", DPA/privacy "her sorgu" yerine kiracı-kimlik sınırı + yetkili platform işlemleri, "RLS … etkin değil" ifadesi). PR #81 hâlâ açık ve birleşmedi; bu işi ondan ayrı, `origin/dev` üzerinden dalladım. Yeniden inceleme yapılmadı.

## Kanıt (ham çıktı)
Placeholder ve sürüm taraması (`origin/dev` tabanlı dal):
```
grep -rn "tüzel kişi unvanı\]" content src tests messages docs   → yalnız content/kvkk-uzman-v1*.md (v1 arşivi)
grep -rn "FonBridge Ltd\|Fonbridge Ltd" docs .env.example | grep -v agent-results → boş
```
Birim (`npx vitest run src/lib/expert-prereg tests/expert-prereg-form.test.tsx tests/expert-prereg-admin-route.test.ts`):
```
Test Files  6 passed (6)
Tests  73 passed (73)
```
Tarayıcı (`next dev`, Playwright chromium, `/tr/uzman` ve `/en/experts`, modal):
```
tr {"unvan":true,"placeholderGone":true,"retention1y":true,"version2":true}
en {"unvan":true,"placeholderGone":true,"retention1y":true,"version2":true}
```
Ekran görüntüsü: `/private/tmp/claude-501/-Users-macbook-alan-FONBRIDGE/ed3b0cc0-9e68-432e-8efb-48c587b30722/scratchpad/kvkk-modal-tr.png` (EN: `kvkk-modal-en.png`, aynı dizin).

Commit kapısı (hook, `--no-verify` YOK): eslint, tsc temiz; commit `f3d0a330`.
Push kapısı (`pnpm gate`): birim 4558/4558 geçti, i18n geçti, e2e 335 geçti; push `f3d0a330` → `origin/se-fb/fo49-kvkk-v2`.

Push'ta yaşanan ortam sorunları (koddan değil):
- İlk denemelerde e2e `localhost:3000` meşguldü (başka bir oturumun `next-server`'ı, PID 27023). Öldürmedim; port boşalınca yeniden push ettim.
- Tam birim koşusunda 30 sn süre aşımı (`expert-prereg-form` "no organisation") ve paylaşılan yerel DB'de bir yarış (`migration-owner-chain.live`: geçici `app.system_scope` varsayılanı). İzole koşuda ilgili dosyalar geçti; ikinci tam koşuda ikisi de geçti.
- Playwright e2e tam koşuda `admin-plan-editor` "assignment-list" (1 hata); aynı spec tek başına 13/13. Flake.

## Değişen dosyalar
`content/kvkk-uzman-v2.md`, `content/kvkk-uzman-v2.en.md`, `src/lib/expert-prereg/server/constants.ts`, `src/components/expert-prereg/kvkk-text.server.ts`, `src/components/expert-prereg/kvkk-text.ts`, `tests/expert-prereg-form.test.tsx`, `tests/e2e/expert-prereg.spec.ts`, `docs/DATA_MODEL.md`, `docs/legal/dpa-tr.md`, `docs/legal/dpa-en.md`, `docs/EFATURA_SETUP.md`, `docs/EFATURA_INTEGRATOR_RFI.md`, `docs/MALI_MUSAVIR_SORULARI.md`, `docs/legal/agency-channel-notice-addendum.md`, `docs/legal/privacy-notice-gap-analysis.md`, `docs/legal/HUKUK-SORULARI-2026-09.md`, `.env.example`.

## Yurt dışı alt işleyen kontrolü
Durdurma koşulu tetiklenmedi. Expert ön kayıt akışında: e-posta kendi SMTP sunucusu (`mail.fonbridge.com`, `src/lib/email/mailer.ts`; patron kararı 29.09.2026); barındırma Vulut (TR). Prereg sayfası ve bileşenlerinde dış CDN/analitik (gtag, sentry, posthog) yok. LinkedIn bağlantısı yalnız kullanıcı tıklarsa açılan paylaşım linki; alt işleyen değil. Google LLC OAuth yalnız giriş yapan kullanıcı akışında, prereg formunda yok.

## Riskler
1. **1 yıl saklama koddan önde.** `origin/dev`'de `ExpertPreRegistration` için süre dolunca silen job yok (`src/lib/jobs/schedule.ts`: yalnız stripe-event, invitation, public-lead temizlikleri). Metin bu haliyle yanlış beyan olur. Silme job'u geri alınamaz veri silme olduğu için eklemedim; patron onayı gerekli. Ayrıca "ilk gönderim" ve aynı e-postayla yeniden kayıt durumunda süre sıfırlanıp sıfırlanmayacağı kodda tanımlı değil.
2. **Üretim e-fatura unvanı.** `INVOICE_SUPPLIER_NAME` üretim env'inde eski unvan (`FonBridge Ltd. Şti.`) kalmış olabilir; belgeler yeni unvana çekildi. Env değeri ops/patron tarafından teyit edilmeli (kesilen faturalarda unvan değişimi ayrı bir karar).
3. **Adres ve MERSİS yok.** KVKK aydınlatma metninde veri sorumlusunun adresi bulunmuyor; repoda MERSİS/adres/KEP yok (HUKUK-1 açık).
4. **Schema default.** `prisma/schema.prisma` `consentTextVersion @default("kvkk-v1")` değiştirilmedi (migration gerektirir). Kayıt akışı her zaman sabiti yazar.
5. **F2/F3 kaynak raporu** (`docs/agent-results/TASK-MVBIYRGLU5EMX-se-fb.md`) bu repoda/`origin/dev`'de yok. İşi kart açıklamasındaki tarifle yaptım.

## Açık sorular
- 1 yıl silme job'u eklensin mi (patron onayı + "ilk gönderim" tanımı)?
- Üretim `INVOICE_SUPPLIER_NAME` yeni unvana çekilsin mi?

## Sonraki adım
- PR #94 (`se-fb/fo49-kvkk-v2` → `dev`) incelemeye hazır; merge edilmedi.
- Riskler 1 ve 2 çözülmeden metin patron onayına hazır sayılmasın.
