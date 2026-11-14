# NG-7 — FE-1.2 Kurum profili, PIC kaydı, ücretsiz uzman ön kaydı (bu tur: madde 1, 2, 4)

**Hüküm:** Kısmen tamam. Madde 1, 2 ve 4 yerelde (headless Playwright, gerçek tıklama/yazma) doğrulandı; madde 2'de eksik olan "PIC boşken eksik" durumu eklendi. Canlı (Hostinger) doğrulama BU TURDA KOŞULMADI — deploy bu görevin kurallarında yasak. Madde 3 (EU Login / LEAR, `org_readiness`) kapsam dışı (BE-02 bekleniyor), yazılmadı.

**Tip:** feature (yeniden kapsam) — mevcut form ve akışlar genişletildi, yeni form açılmadı.

**Platform:** mac (darwin) yerel. Windows ve Linux koşulmadı — neden: bu iş web uygulaması; OS'a bağlı kod yolu yok (süreç/dosya yolu/kısayol değişikliği yapılmadı). Canlı Hostinger koşulmadı — neden: deploy kuralı (kullanıcı onayı olmadan canlıya deploy yok).

## Ne yapıldı

1. **Kurum profili (madde 1):** Mevcut `settings/profile` formu (`profile-form.tsx`, `actions.ts`) değiştirilmedi. Mevcut e2e `e2e-profile-save.spec.ts` gerçek tıklamayla çalıştı: "kaydı sunucuya gönder ve yenilemeden sonra kalıcı ol" ve "sunucu hata dönünce hata göster" testleri geçti. Form alanları: kapasite, anahtar kelime, TRL aralığı, PIC.
2. **PIC (madde 2):**
   - Mevcut `profile-pic.spec.ts` (19 test) girme, kaydetme, yenilemede durma, eşleşme/onay, yetki ve hız sınırı akışlarını gerçek tıklamayla kapsıyor — hepsi geçti.
   - **Eksik olan:** PIC boşken görünür bir "eksik" durumu yoktu (yalnız yardım metni "İsteğe bağlı" vardı). Eklendi: `profile-form.tsx` içinde `pic === ''` ve kaydedilmiş/temizlenmiş değilken `data-testid="tenant-pic-missing"` ile `role="status"` satırı. Metin TR+EN olarak `messages/tr.json` ve `messages/en.json` içinde `Profile.picMissingNotice` anahtarı.
   - Yeni e2e testi: "an empty PIC shows the missing state" — boş PIC'te "PIC eksik" görünür; ekran görüntüsü alınır.
3. **Ücretsiz uzman ön kaydı (madde 4):** `/uzman` formu (`ExpertPreregForm`) kod incelemesinde ücret, ödeme, kart, fiyat, komisyon alanı içermiyor (`src/components/expert-prereg`, `src/lib/expert-prereg`, `src/app/api/expert-preregistration` tarandı: yalnız paylaşım linkleri ve e-posta, ücret ifadesi yok). Yeni e2e testi "NG-7: the free pre-registration form asks for no payment, fee or price": form alanlarının name/id/autocomplete değerlerinde ödeme/ücret kalıbı yok, form metninde ₺, €, $, ücret, ödeme, kredi kartı, fiyat, abonelik ifadesi yok. Mevcut kayıt akışı testleri (doğrulama maili → Kurucu Uzman numarası → admin satırı/CSV) da geçti.
4. **Madde 3:** yazılmadı (BE-02 kapanmadı; mock yok).
5. **NG-179 / NG-52 dosyalarına dokunulmadı.** Gerçek PIC numarası bu rapora, karta veya ekran görüntüsüne yazılmadı; ekran görüntüsünde yalnız boş alan var.

## Kanıt (ham çıktı özeti)

Son koşu (headless, izole DB `127.0.0.1:5650/ng7`, `E2E_PORT=3650`):

```
pnpm exec playwright test tests/e2e/profile-pic.spec.ts tests/e2e/profile-pic-unsolicited.spec.ts tests/e2e/e2e-profile-save.spec.ts tests/e2e/expert-prereg.spec.ts --reporter=line
  35 passed (1.2m)        exit=0
```

Ham log (repo dışı): `/private/tmp/claude-501/-Users-macbook-alan--agentspace-worktrees-nexagrant-fe-1-2/8658eaf5-98c1-482e-af47-dc8856a54898/scratchpad/ng7-e2e-final.log`

Diğer kontroller (aynı koşu öncesi):
- `pnpm typecheck` → exit 0
- `pnpm i18n:check` → "✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text." exit 0
- `pnpm exec eslint` (değişen dosyalar) → exit 0
- `pnpm db:setup` (izole DB) → "db-setup: done (127.0.0.1:5650/ng7)" exit 0

Ekran görüntüleri:
- Boş PIC "eksik" durumu: `docs/agent-results/NG-7-evidence/ng-7-pic-missing-state.png`
- Ücretsiz ön kayıt formu (ödeme alanı yok, tam sayfa): `docs/agent-results/NG-7-evidence/ng-7-expert-prereg-no-fee.png`

## Değişen dosyalar

- `src/app/[locale]/(app)/[workspace]/settings/profile/profile-form.tsx` — PIC boşken "eksik" durumu satırı (+5 satır)
- `messages/tr.json`, `messages/en.json` — `Profile.picMissingNotice` (+1 satır her dosyada)
- `tests/e2e/profile-pic.spec.ts` — "an empty PIC shows the missing state" testi + ekran görüntüsü
- `tests/e2e/expert-prereg.spec.ts` — "NG-7: the free pre-registration form asks for no payment, fee or price" testi
- `docs/agent-results/NG-7-evidence/` — iki ekran görüntüsü
- `docs/agent-results/NG-7-fe-gnd.md` — bu rapor

Yerel ortam (commit'e girmez): `.env` (`.env.example`'dan, gitignore'lu, izole DB'ye işaret ediyor), Docker konteyneri `ng7-pg` (127.0.0.1:5650).

## Riskler

- **Canlı kanıt yok:** Hostinger canlı üzerinde PIC kaydı, boş-PIC durumu ve uzman ön kayıt canlı kaydı (DoD maddeleri) bu turda koşulmadı. Deploy gerekiyor; yasak olduğu için atlandı ve açıkça "koşulamadı" olarak işaretlendi.
- **Uzman formu "ücretsiz" kanıtı negatif:** "ödeme alanı yok" bir kod/ekran taraması ile kanıtlandı; gelecekteki bir ücret alanının bu test tarafından otomatik yakalanacağı garanti değil (kelime listesi bilinen kalıpları tarar).
- **Yeni "eksik" satırı** boş PIC'te her açılışta görünür — kapsamlı bir tamamlanma göstergesi değil, yalnız PIC için.
- Mailpit (`localhost:8025`) paylaşımlı; uzman kayıt testi aynı anda koşan başka bir e2e ile posta karıştırabilir. Bu koşuda çakışma olmadı.

## Açık sorular

- Canlı Hostinger'da (`fonbridge` veya nexagrant canlı alanı) bu üç akışın doğrulanması için deploy onayı gerekiyor. Onay verilirse madde 1/2/4 canlı kanıtı ayrı bir turda alınır.
- Madde 3 için BE-02 (NG-34) kapanmalı; kapanınca ayrı alt-kart açılması önerilir.

## Sonraki adım

1. Lider onayı: commit'in dev'e merge edilmesi / push (bu turda push ve merge YAPILMADI).
2. BE-02 kapanınca madde 3 (`org_readiness` göstergesi) alt-kartı.
3. Onay gelirse canlı Hostinger'da madde 1/2/4 kanıtı.
