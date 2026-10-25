---
sözleşme: agentspace-sonuc-v2
görev: TASK-MVDSTYM1ZI8Y5
kod: FO-82
ajan: crw-fb
motor: claude-haiku-5-5
tip: review (PR #108 kod incelemesi)
okur: patron, se-fb, be-fb
hüküm: DÜZELTME GEREK — bloke eden veri-güvenliği bulgusu YOK; gerekçe/kanıt ve belge düzeltmeleri gerek (bulgu 1–2)
platform: sunucu + yasal metin, işletim sisteminden bağımsız; testler mac (darwin), yerel
tarih: 2026-10-18
---

# TASK-MVDSTYM1ZI8Y5 (FO-82) — PR #108 incelemesi (crw-fb)

**İncelenen:** `se-fb/fo82-audit-erasure`, commit `b1dfc980`, base `dev`. **Ayrı worktree:** `/Users/macbook/alan/FONBRIDGE-crw-review-fo82` (detached, `b1dfc980`; se-fb'nin ağacına dokunulmadı). **Kaynak rapor:** `docs/agent-results/TASK-MVDSTYM1ZI8Y5-se-fb-2.md`.

## Hüküm

**DÜZELTME GEREK.** Silme akışının çekirdeği doğru: kapsam tek kullanıcıya sınırlı, idempotent, `actorId` NULL'lama korunuyor, system scope gerekçeli. Ama yeni `target` satırının gerekçesi (kod yorumu, register örneği, canlı probe) gerçek üretim verisiyle çelişiyor. Veri kaybı ya da sızıntı yok; ama belge ve kanıt düzeltilmeden onay verilmemeli.

## Bulgular (önem sırasına)

**1. [DÜZELTME] Yeni `target` satırının gerekçesi yanlış — satır hiçbir bilinen yazıcının satırını eşlemiyor.**
- `src/lib/jobs/tasks/users-scheduled-deletion.ts:155-160` yorumu: "`target` holds the subject's own id on events about them (e.g. `member.removed`)". Yanlış.
- `src/app/api/team/members/[id]/route.ts:47`: `member.removed` → `target: target.id`, yani **Membership id**. Aynı dosyanın üst yorumu da bunu söylüyor: "The audit row names the membership by id, never the person."
- `src/app/api/team/...` canlı testi `tests/team-management.live.test.ts:260`: `expect(audit[0]!.target).toBe(a.member.membershipId)`. Üretim şekli = membership id.
- `src/` içinde `target:` değerlerinin tamamı tarandı (blog slug, plan id, invoice id, subscription id, invitation id, `subjectRef` hash'i, membership id). Kullanıcı kimliğini `target`'a yazan **hiçbir** yazıcı yok.
- Sonuç: `where: { target: userId }` bugünkü verilerde 0 satır günceller. Satır zararsız (eşleşme yok, idempotent) ama "bu kişinin kimliği `target`'ta" iddiası üzerine kurulu bir koruma değil; gelecekte bir yazıcı kullanıcı kimliğini `target`'a koyarsa yakalar — bunu açıkça yazmak gerekir.
- Düzeltme (birini seç): (a) satırı ve testteki assert'i kaldır, veya (b) satırı tut ama yorumdaki `member.removed` örneğini kaldır ve "bugün yazıcı yok; gelecek yazıcılar için savunma" de. Register §13'teki "(ör. `member.removed`)" örneği de aynı şekilde düzeltilmeli (`docs/legal/processing-register.md` §13 satır 192).
- Not: DPA'nın "bağlantı kaldırılır" iddiası `member.removed` için yine tutuyor, ama sebep satır değil **cascade**: `prisma/schema.prisma:191` `Membership.user` `onDelete: Cascade`, kullanıcı silinince membership gider, `target`'taki membership id'si artık hiçbir kişiye bağlanamaz. Bu gerekçe belgelenmeli.

**2. [DÜZELTME] Canlı probe üretimde olmayan bir satır şekliyle koşulmuş.**
- se-fb raporundaki "a2 `member.removed` target: due → sha256(due)" satırı, üretimin yazmadığı bir fixture (`target = userId`). Yani "canlı test" bu değişikliğin gerçek davranışını kanıtlamıyor; yalnız satırın kendi kendine çalıştığını gösteriyor.
- Mutasyon kontrolü (aşağıda) birim testi kırıyor, ama bu bir mock çağrısı assert'i: satırın varlığını test eder, veritabanı etkisini değil.
- Düzeltme: probe'un a2 satırı kaldırılsın ya da "üretimde yok, savunma amaçlı" diye etiketlensin; raporda "canlı test" ifadesi "yerel probe (sentetik satır)" olarak düzeltilsin.

**3. [ÖNERİ] SHA-256 özet üç yerde kopyalı.**
- `src/actions/user/request-deletion.ts:258`, `src/actions/user/export-data.ts:240`: `createHash('sha256').update(userId).digest('hex')`. `subjectRefOf` (`users-scheduled-deletion.ts:249-251`) ile aynı çıktı, ama PR "tek yer" demiyor — iki kopya kalıyor.
- Öneri: `subjectRefOf` tek modülde (ör. `src/lib/legal/` veya `src/lib/subject-ref.ts`) dışa aktarılıp üç yerde kullanılsın. Bugün çıktılar aynı; sapma riski tek değişiklikte doğar.

**4. [ÖNERİ, kapsam dışı] `docs/DATA_MODEL.md` eski iddia içeriyor.**
- `docs/DATA_MODEL.md:144`: "`AuditEvent` 12 ay anonimleştirilmiş saklanır". Aynı dosya `:958` bunun için budama kodu olmadığını yazıyor. PR bu dosyaya dokunmamış; metin ile kod hâlâ uyuşmuyor. Ayrı kart açılsın.

**5. [ONAY] Metin ve kod artık uyuşuyor (kullanıcıya görünen metinler).**
- `messages/tr.json:957` ve `messages/en.json:957` `terminationBody`: "bağlantı kaldırılır ya da tek yönlü özetle değiştirilir" + "serbest metin alanları kişisel veri içerebilir". İkisi anlamca aynı.
- DPA §6.3 tr/en (`docs/legal/dpa-tr.md:73`, `dpa-en.md:73`): aynı iddialar; ek olarak "silme kaydı kullanıcı kimliğinin tek yönlü özetiyle yazılır" — `user.erased` ile uyumlu (`writeErasureAudit` aynı `subjectRefOf`).
- DPA §6.4 (onaylayan kimliği, faturalar, rıza kaydı) kodla uyumlu: `DualApprovalStep.actorUserId` ve `Consent.userId` silinmiyor (`users-scheduled-deletion.ts:174-193`).
- `grep -i "anonim|kimliksiz|anonymi"` ile `src/` ve `messages/` tarandı: kullanıcıya görünen metinde kalan çelişki yok.

**6. [ONAY] Sürüm kuralı.**
- `src/lib/legal/consent-documents.ts:58`: `PRIVACY_NOTICE.version` `2026-10-18.1` → `2026-10-18.2`, metin değişikliğiyle aynı commit (`b1dfc980`). Dosyadaki kural ("Bump whenever the copy changes") karşılanıyor.

**7. [ONAY] Kapsam, idempotentlik, RLS, tenant izolasyonu.**
- `where: { target: userId }` tam eşitlik; yalnız bu kullanıcının satırları. Kiracı kimliği where'de yok, çünkü aynı bloktaki diğer satırlar da (`actorId`, `ownerId`) kullanıcı-genel. Gerekçe yorumda yazılı.
- İkinci koşu: hedef artık hash, `userId` eşleşmez; kullanıcı zaten silindiği için tekrar çalışmaz. İdempotent.
- `withSystemScope('subject-scoped', ...)` bloğunun içinde; `prisma/rls.sql:59` tenant_or_shared kaldırılmış, AuditEvent system_scope üzerinden yazılıyor. Kiracılar arası sızıntı yok: güncelleme kullanıcı kimliğine bağlı, başka kişinin satırına dokunmuyor.
- `actorId` NULL'lama korunmuş (`users-scheduled-deletion.ts:154`).

**8. [RİSK, bilgi] Özet bir "tek yönlü" ama anonim değil.**
- SHA-256, tuzsuz, kullanıcı kimliği (cuid) üzerinden hesaplanıyor. Kimliği bilen herkes özeti yeniden hesaplayabilir. DPA "tek yönlü özet (hash)" diyor, "anonim" demiyor; bu doğru. Yine de sözcük seçimi yasal metinde dikkatli kalmalı. Karar gerekmiyor, bilgi olarak yazıldı.

## Doğrulama (ben koştum, mac/darwin)

Ayrı worktree `/Users/macbook/alan/FONBRIDGE-crw-review-fo82`, `pnpm install --frozen-lockfile` (6.7s), `prisma generate`.

- `pnpm typecheck` → `tsc --noEmit`, hata yok.
- `pnpm i18n:check` → `✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.`
- `pnpm exec vitest run tests/users-scheduled-deletion.test.ts tests/where-guard-src.test.ts` → `Test Files 2 passed (2)`, `Tests 17 passed (17)`, skipped 0.

**Mutasyon (satır geri alındı, test kırıldı, geri konuldu):**
- `sed` ile `where: { target: userId }` satırı silindi → `tests/users-scheduled-deletion.test.ts` → `Tests 1 failed | 13 passed (14)`, `FAIL ... every uncascaded column is cleared...`, `AssertionError: expected "vi.fn()" to be called with arguments: [ { where: { target: 'due' }, …(1) } ]`.
- `git checkout -- src/lib/jobs/tasks/users-scheduled-deletion.ts` → `Tests 14 passed (14)`.
- Not: bu bir mock çağrı assert'i (bkz. bulgu 2).

**Tam gate (`pnpm gate`) koşulmadı**; se-fb'nin raporundaki gate çıktısı (unit 4746, e2e 366, skip 10) benim tarafımdan doğrulanmadı.

**Not:** ilk `cp .env*` denemesi worktree'de `.env.example`'ı değiştirdi; `git checkout -- .env.example` ile geri alındı, `git status` temiz.

## Değişen dosyalar

- Bu incelemede kaynak dosyası değiştirilmedi.
- Yalnızca bu sonuç dosyası yazıldı: `docs/agent-results/TASK-MVDSTYM1ZI8Y5-crw-fb.md` (ana ağaç, commit edilmedi).

## Riskler

- Bulgu 1–2 belgede ve kanıtta, veri davranışında değil. Yanlış gerekçe bir sonraki geliştiriciye "`member.removed` zaten hash'leniyor/temizleniyor" yanılgısı verebilir.
- Bulgu 3: üç kopya sapma riski taşıyor.

## Açık sorular

- Bulgu 1 için karar: satırı mı kaldırılsın, yoksa "savunma" olarak mı tutulsun? Öneri: kaldır — bugün eşleşen yazıcı yok; gelecek yazıcı bunu kendi kartında ekler.
- Geriye dönük `target` düzeltmesi (önceki silmelerin membership id'leri dahil) kapsam dışı; gerekli değil, çünkü membership cascade ile zaten bağlanamıyor.

## Sonraki adım

1. se-fb: bulgu 1 ve 2 için düzeltme (satır ya da yorum/register/probe etiketi), sonra PR #108 güncellenir.
2. Bulgu 3 ve 4 için ayrı kart (`subjectRefOf` tek modül; `DATA_MODEL.md` 144/958).
3. Düzeltme sonrası bu incelemeyi yeniden koş (ya da kısa bir delta incelemesi).

Review worktree: `/Users/macbook/alan/FONBRIDGE-crw-review-fo82` (silinmedi; lider isterse kaldırılır).
