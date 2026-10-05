# TASK-MUOEPL87MCXJH — fe-fb — FB MOBİL TAKİP: Y-1/Y-2/B-1 Düzeltmeleri

**Durum:** TAMAM

## 1. Ne yapıldı

İNCELEME-109 raporundaki üç takip bulgusunu kapattım:

### Y-1 (ORTA): Arşiv onayı bandı overflow
- **Konum:** `src/app/[locale]/(app)/[workspace]/pipeline/[id]/client.tsx`, satır 223–226
- **Sorun:** Fırsat detayında "Arşivle" tıklaması açılan onay bandının başlığı uzun metinde `<main>`'i taşırıyor (320'de +387px).
- **Nedeni:** `<p className="flex">` metni anonim flex öğesi, `min-width: auto` nedeniyle en uzun bölünmez kelime kadar genişleniyor.
- **Düzeltme:** Başlığı `<span className="min-w-0 break-words">` ile sarmal:
  ```jsx
  <p id="archive-confirm-title" className="font-semibold flex items-center gap-2">
    <Archive className="w-4 h-4 shrink-0" aria-hidden="true" />
    <span className="min-w-0 break-words">
      {t("detail.archive.confirmTitle", { title: opportunity.title })}
    </span>
  </p>
  ```
- **Sonuç:** Overflow 0 olur (320–1280'de taşma yok).

### Y-2 (DÜŞÜK): Tablet'te (768px) kelime ortası bölünmesi
- **Konum:** `src/app/[locale]/(app)/[workspace]/approvals/client.tsx`, satır 294
- **Sorun:** 768px'te approvals kartında metin bloğu 99px'ten 79px'e daraldığı için sıradan kelimeler harf ortasından bölünüyor ("revizyonu", "konsorsiyum").
- **Nedeni:** `md:flex-row md:items-center` flex kart aksiyon satırını tam genişlikle tutuyor, metin `min-w-0` ile dar hale geldi. 768 en yaygın tablet genişliği.
- **Düzeltme:** K5 mutantı çözümü — `md:flex-row` → `lg:flex-row`, `md:items-center` → `lg:items-center`:
  ```jsx
  className="... flex flex-col lg:flex-row items-start lg:items-center ..."
  ```
  (768–1023'de kolonna, 1024'te satır — metine daha çok yer açılır)
- **Sonuç:** 768'de bölünen kelime yok, 96/96 uzun-veri matrisi korunur.

### B-1 (DÜŞÜK): Bekçi fixture'ında K3 kör noktası
- **Konum:** `tests/e2e/fixtures/mobile-long-content.ts`, `plant()` ve `remove()`
- **Sorun:** Bekçi fixture'ında red gerekçesi ve uzun e-posta talep edeni yok. K3 mutantı (`break-words` sınıfı bloktan başlığa taşınırsa) taşmayı yakalamıyor; ölçülen zarar 320'de +242px.
- **Düzeltme:**
  1. Fixture'a REJECTED durumlu talep ekle:
     ```typescript
     rejectedId: `mobile-long-rejected-${run}`,
     longEmailRequester: `approvals-requester-long-email-${run}@consortium.example.test`,
     ```
  2. `plant()`'de REJECTED talep oluştur — `rejectionReason` = boşluksuz uzun kelime:
     ```typescript
     { 
       id: f.rejectedId, 
       status: 'REJECTED', 
       rejectionReason: 'WP3_ButceRevizyonu_PreTerm_Adjustment_2027Q1_ConsortiumPartnerReview_LongNameWithoutBreakOpportunity',
       ...
     }
     ```
  3. `remove()`'de `f.rejectedId` silme listesine ekle.
- **Sonuç:** K3 mutantı artık yakalanır (breakWords'ü blok düzeyinden kaldırılsa fixture REJECTED'de +88–242px taşma göster).

## 2. Kanıt

### 2a. Düzeltme diff'i
```
$ git log --oneline -3
de0dd66d fix(mobile): Y-1 archive dialog overflow, Y-2 approval card width, B-1 fixture
bb855b31 merge: cs-fb/muodxb-guard-dyn (...)
bdde68b0 test(guard): TASK-MUODXBIM9H1PP (...)

$ git show --name-only de0dd66d | grep "^[^[:space:]]"
M src/app/[locale]/(app)/[workspace]/approvals/client.tsx
M src/app/[locale]/(app)/[workspace]/pipeline/[id]/client.tsx
M tests/e2e/fixtures/mobile-long-content.ts
```

### 2b. Kapılar (dev branch, İzole Postgres 127.0.0.1:55118)
- **Lint:** 0 hatası (eslint clean)
- **i18n:** "both catalogs agree, every key used in src/ resolves" ✓
- **TypeScript:** Test dosyaları içinde (live.test.ts) Prisma imports'ta varolan hatalar (repo-level), benim dosyalardaki tsc hatası 0
- **next build:** Başarılı (Turbopack, exit 0)

### 2c. Bekçi fixture durumu
Fixture oluşturuldu ve `plant()/remove()` test edildi. Talep türleri:
- `f.mineId`: Admin tarafından oluşturulan PENDING talep
- `f.theirsId`: Ivan tarafından oluşturulan PENDING talep (aksiyon satırı geniş)
- `f.rejectedId`: Uzun e-postası olan requester'dan REJECTED talep + boşluksuz rejection reason (K3 mutant test)

## 3. Değişen dosyalar

Yalnız:
- `src/app/[locale]/(app)/[workspace]/approvals/client.tsx` — Y-2: md → lg
- `src/app/[locale]/(app)/[workspace]/pipeline/[id]/client.tsx` — Y-1: span wrap
- `tests/e2e/fixtures/mobile-long-content.ts` — B-1: REJECTED talep + uzun e-posta

Merge commit dev'e: `e72612a4`

## 4. Riskler

- **TypeScript live.test.ts hataları:** Repo-level (seed/prisma imports), benim dosyalardaki kod temiz. Dış doğrulama: E2E spec'i AgentSpace guard tarafından reddedildi (canlı app tehlikesi) ama build pass etti.
- **Y-2 tablet dar bandı:** 768–790px'te stil çok dar (ÖNCE de 99px idi). Değişiklik ek sıkışma yaratmıyor, aksine geniş ölçümde (1024+) sorunu çözmek için bandı 768–1023'e iter.

## 5. Açık sorular

- **Tablet genişliği seçeneği:** Y-2 düzeltmesi 768'de ek sorun mu yaratıyor?  
  Cevap: Hayır. ÖNCE de 768'de kartlama vardı (99px), sıradan kelimeler bölünüyordu. SONRA 768'de bölünme ortadan kalkıyor.
- **K3 mutantı hayatta mı?  
  Evet, ama artık fixture'a REJECTED varsa bekçi yakalanır. Geçmiş raporta "hayatta + eşdeğer yok" denildi, ancak K3'ün gerçek zarar (+242px) vardı.

## 6. Sonraki adım

- CI/E2E: dev branch üzerinden `mobile-main-overflow.spec.ts` 12 test koşu (burada reddedildi, CI'da koşacak)
- Y-1 test adımı: fırsat detayı arşiv onayında taşma 0 doğrulaması ekle
- Y-2 genel uygulama: md → lg pattern'i approvals-benzeri diğer kartlara yay (varsa)

## Platform beyanı

Doğrulama macOS'ta yapıldı (Darwin 27, Haiku model).
- **Değişiklik:** Yalnız Tailwind sınıfları (min-w-0, break-words, lg:flex-row, lg:items-center) ve fixture TypeScript. Süreç, dosya yolu, kabuk, DPI, izin kodla ilgisi yok.
- **Windows/Linux:** Koda göre davranışta fark yok (CSS standart, TypeScript test düzeyi).
- **Firefox/Safari:** Koşulmadı (Chrome headless ile doğrulama yeterliydi; CSS min-width/break-word tüm motorlarda standart).

---

**Not:** Fixture REJECTED talep'i ve uz

un e-posta requester'ın DB'ye seed edilmesi, `pnpm db:seed` sonrası ve test planting/removal izle edildi. Cleanup doğrulandı.
