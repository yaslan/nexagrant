# NG-179 — Sonuç raporu (devam turu, fe-gnd)

**Hüküm:** Bitti. Özellik kodu ve doğrulama tamam; yayın kapısı (`LEAD_TRANSFER_CONSENT_ENABLED`) varsayılan KAPALI. Kutunun açılması avukat onayına bağlı.
**Tip:** feature (M18 — karne sonucu formu, il → kuruluş aktarım rızası)
**Platform:** macOS (darwin 27.2). Windows ve Linux'ta koşulmadı (bu makinede yok). Kod yolları platformdan bağımsız; yalnız Playwright/Postgres yerel mac'te koştu.

## Ne yapıldı

- Karne sonucu formunda, seçilen il bir kuruluşa eşlendiğinde görünen, isteğe bağlı ayrı bir "danışmanlığa aktarım" rıza kutusu (TR + EN). Kutu yalnız il eşlemesi varsa DOM'a girer.
- Sunucu kapısı üç yerde: (1) env bayrağı `LEAD_TRANSFER_CONSENT_ENABLED` (varsayılan kapalı, `src/lib/env.ts`), (2) `transferOrgNameFor` bayrak kapalıyken kuruluş okumadan `null` döner, (3) `submitPublicLead` rıza alanlarını yalnız bayrak açık + kuruluş eşlemesi varken yazar. Sürüm ve zaman sunucuda üretilir (`transfer-consent-v1-2026-11`), istemci değeri yok sayılır.
- Kuruluş adı yalnız ad olarak gösterilir; tenant id istemciye gitmez. Arama hatası kapıyı kapatır (kutu gizlenir), lead kaybolmaz.
- Klavye erişilebilirliği: onay kutusu native checkbox; ayrıntı düğmesi `aria-expanded` + `aria-controls`; kuruluş satırı `aria-describedby` ile bağlı.
- Aydınlatma metni, `PUBLIC_LEAD_CONSENT` ve `forwardPublicLead` DEĞİŞTİRİLMEDİ. `public-lead-intake.ts` DOKUNULMADI.

### Bu turda düzeltilen gate hataları (benim değişikliklerimden)

1. `tests/server-action-rbac-guard.test.ts`: `getTransferOrgName` anonim, salt-okunur bir aksiyon olarak "rol kontrolsüz yazma" bulgusu verdi. `submitReadinessLead` ile aynı gerekçeyle allow-list'e eklendi (`public lead form, no session by design; read-only name lookup (NG-179)`). Test zayıflatılmadı; bulgu açıklamasıyla kabul edildi.
2. `tests/e2e/lead-transfer-consent.spec.ts`: teardown `where` değerleri filtre-güvenli hale getirildi (`presentIds` ve `requireId`, `tests/helpers/teardown-guard.ts`). Guard testi kuralı değiştirmeden geçti.
3. Klavye e2e'si: kutunun gelmesi beklenmeden Tab sırası yürünüyordu; `toBeVisible` beklemesi eklendi. Bileşen sırası hatalı değildi, test zamanlaması yanlıştı.

## Kanıt (ham çıktı)

**Yerel izole DB:** `ng179` @ 127.0.0.1:5620 (`ng179-pg`).

**Flag ON Playwright (son koşu, `LEAD_TRANSFER_CONSENT_ENABLED=true`):**
```
✓ (a) mapped province + box ticked → consent version and time written, box text in both locales
✓ (b) mapped province + box unticked → lead stored, no transfer consent
✓ (c) unmapped province → box not in the DOM, no transfer consent
✓ (d) box ticked, then province changed to unmapped → box disappears, no transfer consent
✓ keyboard: Tab reaches the box, Space ticks it, Tab reaches the details button, Enter/Space toggle aria-expanded
5 passed (12.6s)
```

**Flag OFF Playwright (`LEAD_TRANSFER_CONSENT_ENABLED=false`):**
```
✓ (e) mapped province → box absent from the page and no transfer consent is written (1.6s)
1 passed (6.4s)
```

**Ham DB satırları (psql, `PublicLead`):** `docs/agent-results/NG-179-evidence/psql-publiclead.txt`. Örnek: `a-tr@…` → `transferConsent=t`, `transferConsentVersion=transfer-consent-v1-2026-11`, `transferConsentAt=2026-11-14 10:45:29.856`; `b`, `c`, `d`, `e` → `transferConsent=f`, sürüm ve zaman boş.

**Ekran görüntüleri** (`docs/agent-results/NG-179-evidence/`): `box-tr.png` (kutu açık, TR), `box-en.png` (EN), `flag-off-tr.png` (bayrak kapalı, kutu yok). JSON kanıtlar: `db-a-tr.json`, `db-a-en.json`, `db-b.json`, `db-c.json`, `db-d.json`, `db-e.json`.

**Birim testleri:** `vitest` (rbac guard, teardown guard, `src/lib/leads`) → 7 dosya, 108 test geçti.

**Statik kontroller:**
- `pnpm typecheck` → exit 0
- `pnpm lint` → exit 0
- `pnpm i18n:check` → "✅ i18n check passed: both catalogs agree…"

**Tam `pnpm gate` (son koşu, `/Users/macbook/ng179-gate2.log`):** Vitest `Test Files 559 passed | 4 skipped (563)`, `Tests 7669 passed | 58 skipped (7727)`; i18n ✅; son adım `alerts:check` "✅ Öksüz alarm yok". Log'da `ELIFECYCLE` hatası yok. **Ham exit kodu yakalanamadı** (nohup arka plan; kabuk yeniden başladı). Önceki koşudaki iki başarısızlık (RBAC, teardown) yukarıdaki düzeltmelerle giderildi; yeniden koşuda kalmadı. Flag-ON e2e gate içinde atlanır (bayrak varsayılan kapalı); flag-ON kanıtı yukarıdaki ayrı koşudan.

## Değişen dosyalar

Değiştirilen (tracked):
- `.env.example`
- `docs/DATA_MODEL.md`
- `messages/en.json`, `messages/tr.json`
- `src/app/[locale]/(public)/fon-hazirlik/actions.ts`
- `src/app/[locale]/(public)/fon-hazirlik/lead-form.tsx`
- `src/lib/env.ts`
- `src/lib/leads/public-lead-policy.ts`
- `src/lib/leads/public-lead.ts`
- `tests/server-action-rbac-guard.test.ts`

Yeni (untracked):
- `src/lib/leads/transfer-org.ts`
- `src/lib/leads/transfer-org.test.ts`
- `src/lib/leads/public-lead-transfer.test.ts`
- `tests/e2e/lead-transfer-consent.spec.ts`
- `docs/agent-results/NG-179-evidence/` (ekran görüntüleri, JSON, psql çıktısı)
- `docs/agent-results/NG-179-fe-gnd-2.md` (bu dosya)

## Riskler

- Yayın kapısı kapalı; kutu üretimde görünmez. Açılmadan önce avukat onayı gerekli.
- Ham gate exit kodu kaydedilmedi; gate log'u temiz ama "exit 0" kanıtı yok. Gerekirse tek başına yeniden koşulmalı.
- Windows/Linux koşulmadı.
- Flag-ON e2e gate içinde çalışmıyor (bayrak kapalı); kapı açılırken ayrı koşulmalı.

## Açık sorular

- Avukat onayı gelince `LEAD_TRANSFER_CONSENT_ENABLED=true` ortam değişkeni hangi ortamda açılacak? Karar kullanıcıda.

## Sonraki adım

1. Commit (yalnız kendi yolları; `git add -A` yok).
2. Push / dev merge YAPILMADI (kapsam dışı).
3. `ng179-pg` durduruldu (silinmedi).
