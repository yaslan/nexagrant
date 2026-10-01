---
sözleşme: 3
görev: TASK-MUPIQODOCEZH9
kod: TASK-MUPIQODOCEZH9
ajan: crw2-fb
motor: claude
tip: karar
okur: ekip
hüküm: Bitti: Kart 1 (MUPIQODOCEZH9) ONAY, Kart 2 (MUPA6KH1L0CV8 + MUOLBW7PZ7HM4) DEĞİŞİKLİK İSTE (SSS, crw-fb Ö-2/Ö-3 notlarını işlemedi ve dev'de değil), Kart 3 (MUOIBQJJDKL28) ONAY (4 tek satırlık mutasyonun hepsi kırmızıya döndü).
platform: mac (Darwin 27, arm64). Kod ve belge okuma, vitest koşusu (action-leak-scan, saf TS). Linux/Windows koşulamadı: bu makinede yalnız mac var; incelenen işler saf TS/Markdown olduğundan platform farkı beklenmez. Canlı DB doğrulaması yok (:5433 kapalı, MUPE1WNXJGYXT).
sürüm: 1
tarih: 2026-10-01T15:25:49.973Z
---

# FB REVIEW TURU 2 — crw2-fb (3 kart)

Kod değiştirilmedi. Mutasyon için scratchpad'de ayrı worktree kullanıldı, her mutasyon `git checkout -- <dosya>` ile geri alındı, worktree kaldırıldı.

## Kart 1 — TASK-MUPIQODOCEZH9 (be-fb): **ONAY**

**Envanter şemayı kapsıyor mu?** Evet. Şemadaki model sayısı ve ADR'deki ad kontrolü yeniden koşuldu:
```
75 models; with tenantId 50; without 25
ADR-0010 içinde adı geçmeyen model: (hiçbiri)   # 75 modelin hepsi için döngü, çıktı boş
```
`tenantId` taşıyan 50 model (python ile şemadan çıkarıldı) ADR Ek A.1/A.2/A.4/A.5'te var; taşımayan 25 model (Tenant, User, Account, Session, VerificationToken, 5 plan/katalog, 15 paylaşılan katalog/CORDIS) A.1–A.3'te. ADR sayım cümlesi (25 + 50, 29 cascade + 21 FK'siz) şemayla tutuyor. Eksik model yok.

**R2 nesneleri:** `<tenantId>/`, `incoming/<tenantId>/`, `feedback/<tenantId>/`, `exports/<tenantId>/` ADR §2.5'te. `feedback/${tenantId}/…` satırı `src/lib/feedback/submit.ts:104`'te teyit edildi. S3 istemcisi yalnız `src/lib/storage.ts`'te (`grep @aws-sdk/client-s3|PutObjectCommand` → tek dosya).

**ADR-0010 dev'de ve tutarlı mı?** Evet: `git branch --contains ff8b2db6` → `be-fb/p5-tenant-export-prep` ve `dev`; dosya `docs/adr/ADR-0010-tenant-export-and-deletion.md` (290 satır). Bölüm 9 K-1..K-5 özeti rapor §5 ile birebir; Ek A etiketleri (E/E*/H, C/X/S/P) kendi içinde tutarlı. Rapor §2.6'daki "kişi silme depoya dokunmuyor" bulgusu sonradan MUPL2D9B8QWAB ile kodlandı.

**Uygulama kartları açıldı mı?** Hayır, bilerek: rapor §4 U-1..U-8'i "panoya AÇILMADI" diye yazıyor ve K-1..K-5 patron kararını bekliyor. Bu bir hata değil; DoD "açıldı mı" sorusunun yanıtı: açılmadı, lider (leed-fb) açacak.

Öneriler (bloke etmez):
- **Ö-1** `Document.fileUrl` (`prisma/schema.prisma:1212`) ADR A.5 #9'da "dışa E / silme X" ama bir R2 nesnesine mi işaret ettiği yazılı değil. U-2/U-3 yazılırken `grep fileUrl` ile R2'ye işaret edip etmediği doğrulanmalı (tenant_upload türü).
- **Ö-2** Rapor ve R-2: FK listesi şemadan çıkarıldı, canlı `pg_constraint` doğrulaması yok (DB kapalıydı). U-3 canlı testi bunu kapatmalı; yazar da söylüyor.
- **Ö-3** Rapor `/Users/macbook/alan/docs/agent-results/`'te, FONBRIDGE reposunda izlenmiyor (aynı sorun MUPL2D9B8QWAB ve MUPA77EIENLPH'de de var). Entegrasyonda repoya kopyalanmalı.

## Kart 2 — TASK-MUPA6KH1L0CV8 (crw-fb) + TASK-MUOLBW7PZ7HM4 (cs-fb): **DEĞİŞİKLİK İSTE**

İncelenen: SSS ve destek şablonları `cs-fb/pilot-sss` ucu `4566d1a8` (`git show` ile okundu). **dev'de bu iki dosya yok**: `ls docs/beta/` → `beta-weekly-sync.ics partner-tracker.md weekly-sync-template.md`; `git branch --contains 75e27c1c` → yalnız `cs-fb/pilot-sss`.

Tutanlar:
- tr/en eşleşmesi: `grep -c "^### [A-G][0-9]" sss.md` → 38, `grep -c "^\*\*EN" sss.md` → 38; `grep -c "^### Ş-" destek.md` → 11, `**EN` → 11. crw-fb'nin 38/11 sayıları doğru.
- P-9 `info@fonbridge.com` tutarlı: SSS satır 449/457/497/501/538; `4566d1a8` G2'yi ve P-9 tablosunu güncellemiş; dev'de `src/lib/beta/constants.ts:50` `BETA_SUPPORT_EMAIL ?? 'info@fonbridge.com'`; `grep -rn fabrika.dev src docs/beta docs/BETA_GUIDE.md` → boş. Destek şablonlarında e-posta adresi yok (imza adressiz), çelişki yok.

**Y-1 (zorunlu): crw-fb'nin MUPA77EIENLPH Ö-2 ve Ö-3 notları SSS'ye işlenmemiş.**
- Ö-3: P-1 için "Google'ın gönderdiği doğrulama e-postasını onaylayın" adımı SSS A3'te (`sss.md:42-53`) yok. `grep -nE "doğrulama|verif" sss.md destek.md` ilgili adımı vermiyor (yalnız posta doğrulama sözü G2'de).
- Ö-2: D4/D5 (`sss.md:297-326`) ADR-0010'a ve "kurum verisi kurum silinince gider, pilot süresince destek ekibi elle yürütür" cümlesine bağlanmıyor. `grep -n ADR-0010 sss.md destek.md` → boş. D5 hâlâ "[DOĞRULANMADI] kurum hesabı nasıl silinir" diyor, oysa ADR-0010 dev'de ve U-6 kararı geldi.
- İstenen: A3'e doğrulama adımı, D4/D5 ve Ş-7'ye ADR-0010 bağlantısı + el prosedürü cümlesi (tr ve en).

**Y-2: MUPA6KH1L0CV8 raporu bayat bir gerçeği "açık" sayıyor.** Rapor §3.3 ve Bulgular, `support@fabrika.dev` ile `info@fonbridge.com` karışıklığını "P-9 bekliyor" diyerek geçiyor ve ONAY veriyor. P-9 kararı 01.10'da verildi (`95ae554d`, `4566d1a8`); rapor yeniden verilmeli ya da güncellenmeli. Ayrıca `messages/tr.json` için "satır satır doğrulama yapılmadı" (§3.1) — 8 referansın satır numarası kontrolsüz kaldı.

**Ö-1:** SSS ve şablonlar dev'e alınmadı (`cs-fb/pilot-sss` `4566d1a8`); entegrasyon kartı gerek. Ayrıca iki yazar raporu (MUPA6KH1L0CV8, MUOLBW7PZ7HM4) FONBRIDGE reposunda izlenmiyor.

## Kart 3 — TASK-MUOIBQJJDKL28 (cs-fb-3): **ONAY**

Dal `cs-fb/i116-leak-scan-gaps` ucu `ce5039f7` (rapor ucu; kod `f3892470`), scratchpad worktree (detached), node_modules bağlantısıyla. Taban koşu:
```
$ npx vitest run tests/api/action-leak-scan.test.ts
 Test Files  1 passed (1)
      Tests  179 passed (179)
```
Her mutasyon tek satır; sonra `git checkout -- tests/api/action-leak-scan.ts`; her koşudan sonra `git status --short` boş.

| # | Hedef | Satır | Mutasyon | Sonuç |
|---|---|---|---|---|
| M1 | Y-1: `require` takma adı/`createRequire` sonucu yükleyici tanıma | `action-leak-scan.ts:452` | `moduleKind(t) === 'loader'` → `false` | **KIRMIZI**: `× M4 require()`, `× a namespace from require()`, `× \`const r = require as any\``, `× assigned later: let r; r = require`, … (12+ test) |
| M2 | Y-1: createRequire çağrısının sonucu | `:412` | `=== 'factory'` → `=== 'nope'` | **KIRMIZI**: `FAIL … B-2: createRequire from node:module > imported, called in place`, `> imported under another name`, `> through a namespace`, `> its loader bound to a name first`, … |
| M3 | Y-2: `export let` yeniden atama eşleşmesi | `:1667` | `return false && targets.some(...)` | **KIRMIZI**: `FAIL … X8/Ö-1: an export let action given another value > act = run`, `> act ||= run`, `> [act] = [run]`, `> ({ act } = { act: run })`, `> export var` |
| M4 | Y-2: yeniden atanan değer sızıntı sayılmıyor | `:1667` | `&& nodeLeaks(...)` → `&& false` | **KIRMIZI**: aynı beş test (`act = run` … `export var`) |

(İlk M3 denemesinde hedef satır numarası yanlıştı, sed eşleşmedi, değişiklik oluşmadı ve 179/179 yeşil çıktı; bu mutasyon sayılmadı. Satır `grep` ile bulunup M3 yeniden koşuldu.)

Geri alma kanıtı (her mutasyondan sonra ve sonda):
```
$ git status
Not currently on any branch.
nothing to commit, working tree clean       # HEAD ce5039f7
```
Kırmızıya dönmeyen tanık yok → DEĞİŞİKLİK İSTE koşulu oluşmadı. Not: kartın "Y-2" etiketi iki anlamda geçiyor (İNCELEME-118 Y-2 = A1/A4/A10 tanıkları; `export let` = Ö-1/X8). Bu incelemede görevin "export let yeniden atama" tanımı kullanıldı; A1/A4/A10 tanıkları için yazarın önce/sonra tablosu (`mutants118-before/after`) yeniden koşulmadı.

## Özet

| Kart | Hüküm |
|---|---|
| MUPIQODOCEZH9 | ONAY |
| MUPA6KH1L0CV8 + MUOLBW7PZ7HM4 | DEĞİŞİKLİK İSTE (Y-1, Y-2) |
| MUOIBQJJDKL28 | ONAY |
