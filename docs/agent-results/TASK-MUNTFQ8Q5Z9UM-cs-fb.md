# TASK-MUNTFQ8Q5Z9UM — cs-fb — İNCELEME-65 B-1/Y-1/D-1/D-2 düzeltmesi

**Durum:** TAMAM
**Dal:** `cs-fb/muntfq-kind-gate` (dev `cdb85b2c` üzerinden), dev'e merge edildi. Push yok.
**İzole ortam:** kendi worktree'm ve kendi DB konteynerim `csfb-muntfq-pg` (`pgvector/pgvector:pg16`, 127.0.0.1:5471). DB'yi CI "Prepare database" adımlarıyla hazırladım (`db push`, `db:rls-role`, migrations ×2, `db:rls`, `db:seed`). Sunucu: aynı worktree'nin `next build` + `next start` çıktısı, :3071. Paylaşılan fabrika-postgres :5433'e yalnız `BEGIN READ ONLY` ile baktım, yazmadım.

**Platform beyanı:** Doğrulamayı mac'te yaptım (Darwin 27, Node, vitest 4.1.11, Next 16, headless Chromium 1243). Değişen kod platforma bağlı değil: zod enum, `String.prototype.normalize('NFKC')`, `\p{Cf}` regex, locale'siz `toUpperCase`, React state ve Tailwind sınıfları. Dosya yolu, süreç veya kabuk kullanmıyor. `toUpperCase` bilerek locale'siz: Türkçe locale'li bir sunucuda da `"loi"` → `"LOI"` olur (`toLocaleUpperCase('tr')` olsaydı `"LOİ"` olurdu). Windows ve Linux'ta koşulamadı, çünkü bu makinede yalnız mac var. CI (ubuntu) push'ta Linux'u koşar.

---

## 1. Ne yapıldı

### B-1 (BLOKE): tür kapısı iki katmanda kapandı
1. **Yazma tarafı, kapalı liste:** Yeni dosya `src/lib/followup-doc-kinds.ts` şunları içeriyor:
   - `FOLLOWUP_DOC_KINDS = ['NDA','LOI','COMMITMENT','ESR_DEBRIEF','AWARD_PACK']`
   - `FollowupDocKindSchema = z.enum(...)`
   `generateStandardDoc` şimdi `requestedKind: FollowupDocKind` alıyor; `| string` kalktı. Tür, `assertModuleAccess`'ten hemen sonra zod ile doğrulanıyor. Bu, `requireTenantAction`'dan, opportunity okumasından, LLM çağrısından ve kredi düşümünden önce oluyor. Listede olmayan tür şu hatayla reddediliyor: `Unknown document kind. No document was created and no credit was charged.` Satır yazılmıyor, LLM çağrılmıyor. DB'de `kind` yazan tek yer bu aksiyon (grep: `followupDoc.create` yalnız `actions.ts:138`).
2. **İmza tarafı, fail-closed kapı:** `documentKindRequiresDualApproval(kind)` önce türü normalize ediyor: NFKC, `\p{Cf}` biçim karakterlerini silme (ZWSP, ZWJ, BOM, bidi), `trim`, `toUpperCase`. Sonra şu kurala göre karar veriyor: **normalize hâli `DIRECT_SIGN_DOCUMENT_KINDS` (`ESR_DEBRIEF`, `AWARD_PACK`) içinde değilse çift onay gerekir.** Yani varyantlar (`nda`, `NDA `, `NDA​`, `ＮＤＡ`) NDA sayılıyor. Kiril homoglif `NDА`, `CONTRACT`, boş string gibi bilinmeyen yazımlar da doğrudan imzalanamıyor. `rbac.ts` aynı iki ismi yeniden export ediyor; çağıranlar değişmedi.
3. **Arayüz:**
   - Filtre, etiket ve rozet normalize tür üzerinden çalışıyor. `"NDA "` satırı artık "Yasal Anlaşmalar" filtresinde görünüyor ve NDA rozeti taşıyor (eskiden filtrede saklanıyordu).
   - Ö-2 uygulandı: çift onaylı türlerde "Elektronik İmzala" düğmesi hiç gösterilmiyor. Bu, bilinmeyen türleri de kapsıyor; aynı fonksiyon kullanılıyor.

### Y-1: ret mesajı tıklanan satırın altında
`signDocument` reddi ya da hatası artık sayfanın en üstünde değil, tıklanan satırın hemen altında ayrı bir `<tr>` içinde `role="alert"` olarak görünüyor. İlk denemede 390 px'te tablo yana kaydığı için metin kutunun solunda, ekran dışında kalıyordu. Kanıt: `pre-sticky-390-row-refusal-clipped.png`. Mesaj şimdi `sticky left-4` ile görünüme yapışıyor ve `max-w-[calc(100vw-7rem)]` ile satır kırarak ekrana sığıyor. Üretim hataları (`docError`) yerinde kaldı, çünkü üretim düğmeleri de üstte.

### D-1 ve D-2: test boşlukları
- **D-1:** Canlı testte `test.each([...DUAL_APPROVAL_DOCUMENT_KINDS])` yerine sabit `['NDA','LOI','COMMITMENT']` var. Ayrıca iki yerde `expect(DUAL_APPROVAL_DOCUMENT_KINDS).toEqual([...])` var (canlı test ve birim test). Liste boşaltılınca test sayısı artık düşmüyor (64 → 64) ve 2 test kırmızı oluyor.
- **D-2:** crw-fb'nin A2 yarış testi canlı teste eklendi. Satır `FOR UPDATE` ile kilitleniyor. Kilit beklemesi `pg_stat_activity` ile 5 sn'ye kadar yoklanıyor ve `waiting > 0` bekleniyor. Sonra `createNewVersion`'ın yazdıkları commit'leniyor. Beklenen sonuç: `DOC_NOT_FOUND`, v2 imzasız, adımlar boş.

### Mevcut satır taraması (salt okuma, :5433)
`followupdoc-kind-scan-5433.txt` dosyasında. `fabrika` DB'sinde `FollowupDoc` **0 satır**, `sefb_mulql2` DB'sinde de 0 satır. Standart dışı tür yok, standart dışı olup imzalanmış satır da yok. Diğer DB'lerde (`postgres`, `fabrika_db`, `fabrika_planver_probe`) tablo yok. Canlı (prod) DB'ye erişimim yok; orada aynı sorgu çalıştırılmalı (§5).

### Kapsam dışı bırakılanlar
- Ö-1 (`REVISION_CHANGED` ayrı ret kodu): kartta yok, yapmadım.
- CHECK constraint: yapmadım. Tek yazıcı artık zod'la kapalı; migration ayrı bir iş (§5).

## 2. Kanıt

### A1 saldırısı (crw-fb'nin ek dosyası, değiştirilmeden koşuldu, benim DB'mde)
```
× A1 … kind "nda"        → Unknown document kind. No document was created and no credit was charged.
× A1 … kind "Nda"        → Unknown document kind. …
× A1 … kind "NDA "       → Unknown document kind. …
× A1 … kind " NDA"       → Unknown document kind. …
× A1 … kind "loi"        → Unknown document kind. …
× A1 … kind "Commitment" → Unknown document kind. …
× A1 … kind "NDA​"        → Unknown document kind. …
✓ A2 revision race …  (A2 blocked sessions on FollowupDoc lock: 1)
✓ A3 ✓ A4 GUEST_PARTNER ✓ A4 MEMBER ✓ A5 ✓ A6
Tests  7 failed | 6 passed (13)
```
A1'in 7 satırının hepsi **reddedildi**. A1 dosyası `gen.id`'ye eriştiği için bu satırlar "×" gösteriyor: saldırı ilk adımda hata alıyor, satır ve imza oluşmuyor. Önceki çıktıda 7/7 `success:true` idi. Bu dosyayı repoya koymadım. Aynı durumlar, beklenen güvenli sonuçla yazılmış olarak kendi canlı testimde yeşil (aşağıda).

### Canlı test (`tests/m10-sign-dual-approval.live.test.ts`, `--reporter=verbose`) → `Tests 27 passed (27)`
Yeni satırlar:
```
✓ the dual approval kinds are NDA, LOI and COMMITMENT
✓ WRITER cannot sign a NDA|LOI|COMMITMENT that never entered the flow; the row is unchanged   (sabit liste)
✓ generateStandardDoc refuses the kind "nda"|"Nda"|"NDA "|" NDA"|"loi"|"Commitment"|"NDA​" before the LLM; no row is written   (7)
✓ counterfactual: generateStandardDoc still writes an exact NDA, which then needs the flow
✓ a row already stored as "nda"|…|"NDA​"|"NDА"|"CONTRACT" is not signed directly; the row is unchanged   (9)
✓ a variant row taken through the flow is signed with the legal timestamp
✓ a revision committed between the read and the write is not signed on the old approvals   (D-2)
```
Birim testi `tests/followup-doc-kinds.test.ts` şunları sınıyor: listeler sabit; 9 varyant bilinen türe normalize oluyor ve çift onay istiyor; 6 bilinmeyen yazım (homoglif dahil) çift onay istiyor; zod şeması yalnız tam yazımları kabul ediyor.

### Mutantlar (her biri geri alındı; `git diff` temiz. Koşulan: kinds birim + canlı imza + `tests/modules/m10.test.ts`, toplam 64 test)
| # | Mutasyon | Sonuç |
|---|---|---|
| M1 | Yazma tarafındaki zod kontrolü kaldırıldı (`if (false)`, `kind = requestedKind`) | **Öldü:** 7 kırmızı |
| M2 | Kapı eski birebir `includes`'a döndü | **Öldü:** 25 kırmızı |
| M3 | Kapı fail-open (bilinmeyen tür → doğrudan imza) | **Öldü:** 8 kırmızı |
| M4 | `\p{Cf}` silme kaldırıldı | **Öldü:** 1 kırmızı |
| M5 | `DUAL_APPROVAL_DOCUMENT_KINDS = []` | **Öldü:** 2 kırmızı; test sayısı 64'te kaldı (D-1) |
| M6 | `where`'den `version` kaldırıldı | **Öldü:** 2 kırmızı (biri davranışsal A2 yarış testi, D-2) |
| M7 | NDA doğrudan imza listesine eklendi | **Öldü:** 19 kırmızı |
| UI | Satır içi uyarının `sticky` hâli olmadan (ilk sürüm) | Tarayıcı kontrolü **kırmızı**: 390 px'te `refusalInViewport: false` |

### Tarayıcı (gerçek tıklama, `next start` :3071, WRITER JWT, headless Chromium; 390×844 ve 1440×900)
Çıktı `i65-shots-output.json.txt` dosyasında, iki genişlikte de aynı:
```
signButtons: { nda: 0, variant("NDA "): 0, esr: 1, award: 1 }
legalFilterRows: 2, legalFilterVariantVisible: true
refusalText: "Doküman bu çalışma alanında bulunamadı."   refusalInViewport: true
  (pencere içinde + iki uçta elementFromPoint aynı öğe = hiçbir ata tarafından kırpılmıyor)
esrSignedAt: 2026-09-30T08:40:56.741Z (390)  ndaRow.signedAt: null  variantRow.signedAt: null
```
Ret durumunu şöyle kurdum: sayfa yüklendikten sonra AWARD_PACK satırını kendi DB'mden sildim, sonra "Elektronik İmzala"ya tıkladım → `DOC_NOT_FOUND`. NDA türleri için bu ret artık tıklanabilir değil, çünkü Ö-2 düğmeyi gizliyor.

Kareler (`TASK-MUNTFQ8Q5Z9UM-cs-fb-ekler/`):
- `i65fix-390-table.png`, `i65fix-1440-table.png`
- `i65fix-390-legal-filter.png`, `i65fix-1440-legal-filter.png`: iki NDA satırı var, "İmzala" yok.
- `i65fix-390-row-refusal.png`, `i65fix-1440-row-refusal.png`: mesaj satırın altında, tamamı görünüyor.
- `i65fix-*-esr-signed.png`: karşı-olgu, doğrudan tür tek tıkla imzalanıyor.
- `pre-sticky-390-row-refusal-clipped.png`: düzeltme öncesi kırpılma.

### Kapılar
```
pnpm typecheck  → TC=0
pnpm lint       → LINT=0
pnpm i18n:check → I18N=0  "✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text."
pnpm build      → BUILD=0 "✓ Compiled successfully" (yalnız bilinen instrumentation Edge uyarısı; bu değişiklikle ilgisi yok)

tam koşum: CI=true AUTH_SECRET=<ci fixture> npx vitest run   (DB csfb-muntfq-pg, yük ortalaması 30–84)
  Test Files  3 failed | 265 passed | 2 skipped (270)
       Tests  3 failed | 3212 passed | 22 skipped (3237)
  kırmızılar: k1-embeddings.live (expected 2 to be 6), rag-pdf-worker-isolation (parse_too_heavy), withholding-rounding (Test timed out in 5000ms)
tek tek yeniden koşum (yük ~50):
  tests/k1-embeddings.live.test.ts        Tests 6 passed | 1 skipped (7)
  tests/rag-pdf-worker-isolation.test.ts  Tests 14 passed (14)
  tests/withholding-rounding.test.ts      Tests 8 passed (8)
```
İlk tam koşumda bir where-guard kırmızısı vardı. Kaynağı benim yarış testimdi (`followupDocId: doc.id`). `requireId(doc.id, 'docId')` ile düzelttim; ikinci tam koşumda yok. İki koşumda da M10 ya da imza dosyalarında kırmızı yok. Kalan 3 kırmızı yük kaynaklı zaman ve CPU bütçesi (crw-fb §4'teki aynı aile). Tek tek koşulunca yeşiller. `withholding-rounding` dev tabanında da tek başına yeşil (8/8).

## 3. Değişen dosyalar
- `src/lib/followup-doc-kinds.ts` (yeni): kapalı liste, zod şeması, normalize fonksiyonu, fail-closed kapı. `@prisma/client` import etmiyor.
- `src/lib/rbac.ts`: sabit ve kapı yeni modülden yeniden export ediliyor.
- `src/modules/m10/server/actions.ts`: `generateStandardDoc` tür doğrulaması.
- `src/app/[locale]/(app)/[workspace]/opportunities/[id]/documents/client.tsx`: normalize filtre, etiket ve rozet; Ö-2; satır içi ret (Y-1); `data-testid`'ler.
- `tests/followup-doc-kinds.test.ts` (yeni), `tests/m10-sign-dual-approval.live.test.ts`: B-1, D-1 ve D-2 testleri.
- `docs/agent-results/TASK-MUNTFQ8Q5Z9UM-cs-fb.md` ve `…-cs-fb-ekler/`: kareler, tarayıcı betiği (`.txt`), çıktı, tarama.

## 4. Riskler
- **Fail-closed yan etkisi:** Tabloda bilinmeyen türde bir satır varsa artık doğrudan imzalanamaz, yalnız çift onay akışıyla imzalanır. Tarama 0 satır gösterdi; canlıda da kontrol edilmeli (§5).
- **İstemci hata metni:** Bilinmeyen tür hatası i18n'e bağlı değil ve istemci onu göstermiyor (`errorText(err, null)`). Arayüz yalnız kapalı listeden tür gönderdiği için normal kullanıcı bu hatayı görmez; yalnız elle POST eden alır.
- **Sticky uyarı:** Tailwind `sticky` davranışı `<td>` içinde Chromium'da ölçüldü. Safari ve Firefox'ta koşulmadı; `position: sticky` tablo hücresi içeriğinde modern tarayıcıların hepsinde destekleniyor.

## 5. Açık sorular
- **Canlı veri:** Prod'da `select kind, count(*), count(*) filter (where "signedAt" is not null) from "FollowupDoc" group by 1` çalıştırılmalı. Ben koşamadım, çünkü prod erişimim yok. Varyant bir satır önceden imzalanmışsa düzeltme o imzayı geri almaz.
- **CHECK constraint:** `FollowupDoc.kind` için `CHECK (kind IN (...))` migration'ı istenirse ayrı kart olmalı. Önce yukarıdaki sorgu koşulmalı.
- **AWARD_PACK:** Çift onay gerekip gerekmediği hâlâ ürün sorusu (cs-fb §5-1, crw-fb §6). Şimdilik doğrudan imza listesinde.

## 6. Sonraki adım
- crw-fb: kısa yeniden inceleme (A1–A6 ve tam koşum).
- devop-fb: 1 Ekim push'u (TASK-MUMACETT8NSI4). Bu değişiklik dev'de.

## Ortam temizliği
`:3071` sunucusu (kendi sürecim) kapatıldı. Geçici tarayıcı betiği worktree'den silindi; kopyası eklerde. `csfb-muntfq-pg` konteyneri ve worktree'm merge'den sonra kaldırıldı.
