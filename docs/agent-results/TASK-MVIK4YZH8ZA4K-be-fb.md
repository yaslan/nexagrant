# TASK-MVIK4YZH8ZA4K (FO-117) — keep.eu ham hata metni admin action'a sızıyor

**Hüküm:** KISMİ — kod ve testler tamam; UI'da gerçek tıklama ile çevrilmiş hata mesajının görülmesi YAPILMADI (aşağıda neden).
**Tip:** bug (güvenlik: hata gövdesi sızıntısı)
**Platform:** mac'te doğrulandı (macOS Darwin 27, zsh). Saf TS + statik tarama testi; platforma bağlı yol yok.

## Ne yapıldı
- `src/lib/keep-eu-sync.ts`: `KeepEuFetchErrorCode` (`missing_api_key | forbidden | upstream_error | timeout | network_error`) eklendi. `fetchKeepEuOpenData` artık `error` alanında yalnız bu sabit kodları döndürüyor; HTTP durumu, `errorMessage(err)` ve env anahtar metni yalnız `recordAlert` mesajına gidiyor. `KeepEuSyncResult.upstreamError` eklendi; `upstreamOk` false iken dolu.
- `src/app/[locale]/admin/interreg/client.tsx`: `upstreamError` varsa başarı banner'ı yerine kodun çevrilmiş mesajı gösteriliyor (`UPSTREAM_ERROR_KEYS`, `satisfies Record<KeepEuFetchErrorCode,…>`). Önceden upstream hatasında da "Senkronizasyon Başarılı" banner'ı görünüyordu; bu da düzeldi.
- `messages/en.json`, `messages/tr.json`: `adminInterreg` altına 5 anahtar (`upstream*`). Yalnız bu hunk stage edildi; dosyalardaki başka ajanın (pipeline fullscreen) değişiklikleri working tree'de duruyor, commit'e girmedi.
- `tests/keep-eu-sync.test.ts`: `toContain` ile metin assert eden 2 test kod bazlı `toBe`'ye çevrildi; 500 → `upstream_error`, ağ hatası → `network_error` (ham metin dönüşte yok) ve `syncKeepEuData` başarısız okuma testi eklendi.
- Guard testi (`tests/api/api-error-body-guard.test.ts`) ve `src/lib/api-error.ts` DEĞİŞTİRİLMEDİ, allowlist eklenmedi.

## Kanıt (ham çıktı)
```
perl -e 'alarm 900; exec @ARGV' pnpm exec vitest run tests/api/api-error-body-guard.test.ts tests/keep-eu-sync.test.ts tests/admin-interreg-actions.test.ts
 Test Files  3 passed (3)
      Tests  50 passed (50)
```
Önce (düzeltme öncesi): `1 failed | 46 passed` — `actions.ts line 34 ← src/lib/keep-eu-sync.ts#syncKeepEuData ← fetchKeepEuOpenData() (line 462)`.

`pnpm lint` exit 0 (yalnız dosya dışı, önceden var olan 4 uyarı; hiçbiri bu değişikliklerde değil).
`pnpm typecheck` exit 0.

`git diff --cached --stat` (commit öncesi):
```
 messages/en.json | 5 ++++
 messages/tr.json | 5 ++++
 src/app/[locale]/admin/interreg/client.tsx | 17 ++++++++++--
 src/lib/keep-eu-sync.ts | 22 +++++++++++----
 tests/keep-eu-sync.test.ts | 44 ++++++++++++++++++++++++++++--
```

## UI doğrulaması — YAPILMADI (kısmi)
- Dev sunucu :3000 çalışıyor; `/tr/admin/interreg` admin oturumunda açıldı, sayfa render oldu (ekran görüntüsü: `/var/folders/4q/vwck56vd699b6jw6gp1sc0w80000gn/T/agentdesk-images/run-88160-1792569972626/agentdesk-browser-1792614775869-5-screenshot.png`; hata banner'ı görünmüyor, çünkü tıklanmadı).
- Neden tıklanmadı: `.env` içinde `KEEP_EU_API_KEY` dolu. "Anahtar yokken" senaryosu için bu değer kaldırılmalı (secret dosyasına dokunmadım). Anahtar varken tıklama canlı keep.eu'ya gider ve başarılıysa dev DB'ye yazar. Bu, onay gerektiren bir işlem.
- Beklenen: anahtar yokken "keep.eu API anahtarı tanımlı değil…" banner'ı, 403'te "keep.eu erişimi reddetti…".

## Değişen dosyalar
- src/lib/keep-eu-sync.ts
- src/app/[locale]/admin/interreg/client.tsx
- tests/keep-eu-sync.test.ts
- messages/en.json (5 satır)
- messages/tr.json (5 satır)
- docs/agent-results/TASK-MVIK4YZH8ZA4K-be-fb.md (bu dosya)

## Riskler
- `scripts/run-keep-eu-sync.ts:152` artık `fetchRes.error`'ı kod olarak yazdırıyor (HTTP durumu konsola düşmüyor; ayrıntı SystemAlert'te).
- Turkish/English metinler gözden geçirilmedi (çevirmen onayı yok).
- Canlı keep.eu ile 403/200 davranışı bu oturumda koşturulmadı.

## Açık sorular
- Lider: UI tıklama doğrulamasını `.env` anahtarını geçici kaldırarak mı, yoksa 403 yanıtıyla mı (canlı çağrı) yapayım?
- FO-113 dalı push'u ve rebase ayrı iş (kart kapsamı dışı).

## Sonraki adım
1. Onay gelirse UI tıklaması + ekran görüntüsü (DoD maddesi).
2. Ardından kartı `review`'a al.

Hafıza: yeni kalıcı bilgi için kayıt aşağıda yazılacak.
