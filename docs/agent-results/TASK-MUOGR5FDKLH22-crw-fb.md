---
sözleşme: 3
görev: TASK-MUOGR5FDKLH22
kod: TASK-MUOGR5FDKLH22
ajan: crw-fb
motor: claude
tip: hata
okur: ekip
hüküm: Bitti: ONAY — havuz doluyken confirm `{success:false,error:'service_busy'}` dönüyor (toStrictEqual tanığı), tr/en `Evidence.upload.error.service_busy` var. İki bağımsız mutantım öldü, dev ile deneme birleşimi temiz (217 test + tsc 0). Bloke eden bulgu yok; dal hâlâ dev'e alınmadı.
platform: mac (Darwin 27.0). Birim ve bekçi testleri scratchpad worktree'sinde koşuldu. Canlı S2 (gerçek havuz) ve tarayıcı akışı koşulamadı: fabrika Postgres ve Docker verisi yok (TASK-MUPL268JAAWHD). Bu ikisi için yazarın ve İNCELEME-119'un ölçümüne dayanıldı. Değişiklik bir try/catch ve iki JSON anahtarı; platforma bağlı yol yok. Linux/Windows koşulmadı.
sürüm: 1
tarih: 2026-10-01T15:02:36.703Z
---

# FB REVIEW — evidence confirm service_busy (be-fb, eca85723): bağımsız inceleme

**İncelenen:** dal `be-fb/g1-confirm-service-busy` @ `eca85723` (kod `149d4313`). Yazar raporu `TASK-MUOGR5FDKLH22-be-fb-2.md` dalda. Önceki bağımsız inceleme: İNCELEME-119 (crw2-fb, `6d704b18`) ONAY.

## 1. Ne yapıldı
- `149d4313` diff'i okundu: `actions.ts` yalnız `confirmEvidenceUploadAction`'ın `requireTenantAction` çağrısını try içine alıyor. `isServiceBusy(error)` → `{ success: false as const, error: 'service_busy' as const }`, diğer her hata `throw error`. `messages/tr.json` ve `en.json`'a birer anahtar eklenmiş.
- İstemci: `evidence-client.tsx:229` → `t(\`upload.error.${res.error}\`)`. Yeni kod anahtara kendiliğinden düşüyor, istemcide değişiklik gerekmiyor. Doğrulandı.
- Önkoşul: `cs-fb/g1-pool-timeout` (tipli `ServiceBusyError`) **artık dev'de** (`git merge-base --is-ancestor cs-fb/g1-pool-timeout dev` → doğru; merge `d57e2bb5`). Raporun Risk 1'i bu yüzden kapandı.
- Confirm'in geri kalanı (`withTenantLockPool`) ayrı havuzda ve kendi `try`'ında. Kartın kapsamı yalnız pilot kontrolü.

## 2. Kanıt (benim koşumlarım)
```
# dal ucu eca85723
npx vitest run tests/confirm-service-busy.test.tsx tests/service-busy-action.test.tsx
 Test Files  2 passed (2)
      Tests  20 passed (20)

# Mutant A (benim): catch'te `if (true || isServiceBusy(error)) return …` (her hatayı yut)
     × an ended pilot still rejects with PILOT_EXPIRED
     × a role that may not upload still rejects with FORBIDDEN_ROLE
     × a query the database refused (P2002) is not swallowed …
     × a programming error is not swallowed …
      Tests  4 failed | 4 passed (8)          → KILLED
# Mutant B (benim): tr.json'dan service_busy satırı silindi
      Tests  2 failed | 6 passed (8)          → KILLED
# ikisi de git checkout ile geri alındı, status temiz

# dev (0e834904) + eca85723 deneme birleşimi (merge-tree --write-tree, çakışma yok; ayrı worktree)
npx vitest run tests/confirm-service-busy.test.tsx tests/service-busy-action.test.tsx \
  tests/server-action-rbac-guard.test.ts tests/api/action-leak-scan.test.ts
 Test Files  4 passed (4)
      Tests  217 passed (217)
npx tsc --noEmit -p .   → tsc=0
tr: "Sistem şu an çok yoğun; belge kaydedilmedi. Birkaç saniye sonra yeniden yükleyin."
```

## 3. Bulgular
B ya da Y yok.

- **Ö-1: Dev'e alınmadı.** `149d4313` dev'in atası değil. Önkoşul artık dev'de ve birleşim temiz, yani tek dal olarak alınabilir. Entegrasyon kartı açılmalı. Kart ancak merge sonrası done olur.
- **Ö-2: İki yazım.** `SERVICE_BUSY_CODE = 'serviceBusy'` (`src/lib/service-busy.ts`) ile action kodu `'service_busy'` farklı yazılıyor (yazarın Risk 4'ü). Bugün bir sorun çıkarmıyor, çünkü `upload.error.*` anahtarları snake_case. Bir sonraki dokunuşta tek sabite bağlanması önerilir.
- **Ö-3: Kapsam dışı not.** Havuz uzun süre doluysa ilk düşen `auth()` jwt okuması olur ve kullanıcı "kiracı yok" görür (İNCELEME-119 Y-1). Bu iş TASK-MUOKWIF6MNTM4'te analiz edildi (board: done). Bu kartı bloke etmez.
- **Ö-4:** `devop-fb/muoibd-gates` dalında yanlış yerde duran `57e13bc0` ve onun geri alması `5de7a1d1` var. O dal olduğu gibi dev'e alınmamalı.

## 4. DoD kontrolü
| Madde | Durum |
|---|---|
| Havuz dolu → `{success:false,error:'service_busy'}` | ✅ birim (gerçek `requireTenantAction`) + yazarın ve İNCELEME-119'un canlı S2'si; canlıyı ben koşamadım |
| Diğer hatalar yutulmuyor | ✅ mutant A KILLED |
| tr/en çeviri | ✅ mutant B KILLED, metin yukarıda |
| Test tanığı | ✅ `tests/confirm-service-busy.test.tsx` (8 test) |
| Bekçiler / tsc | ✅ dev birleşiminde |
| Dev'de | ❌ entegrasyon bekliyor |

## 5. Değişen dosyalar
Yalnız bu rapor.

## 6. Sonraki adım
Entegrasyon kartı: `be-fb/g1-confirm-service-busy` → dev. Fabrika DB yeniden kurulunca canlı `.live` takımı koşulmalı.
