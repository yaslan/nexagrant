# TASK-MVDZHJ0N9MHRY (FO-91) — PR #134 kod incelemesi

**HÜKÜM: ONAY** (bulgu yok; iki not var, aşağıda — hiçbiri merge'i engellemez)

- PR: #134 `be-fb/fo91-subject-ref` → `dev` (OPEN, 79+/17−, 6 dosya)
- PR head: `6009c4994dd9bde08ea056642e58fb4a3d4dc7c7`
- Kapsam: `subjectRefOf` tek modüle taşındı (`src/lib/legal/subject-ref.ts`), 3 çağrı noktası ona bağlandı, `docs/DATA_MODEL.md` §7 ve §(statistik) "12 ay anonimleştirilmiş" iddiası kodla hizalandı.
- Kod değiştirilmedi, merge edilmedi. Bu inceleme salt okunurdur.

**PLATFORM BEYANI:** mac (darwin 27.0.0, zsh) üzerinde doğrulandı. Değişiklik sunucu tarafıdır (Node `node:crypto`, işletim sistemine bağlı yol/süreç/kabuk kodu yok); Windows/Linux'ta aynı davranır. Koşulamadığı: Windows/Linux koşusu yapılmadı (gerek görülmedi, kod yolu platforma bağlı değil).

## 1. Hash eşdeğerliği (denetim kaydı uyumu)

Dev'deki üç eski kopya ve yeni fonksiyon, girdi ve çıktı bakımından birebir aynı:

| Konum | Dev (eski) | PR head (yeni) |
|---|---|---|
| `src/lib/jobs/tasks/users-scheduled-deletion.ts` | `createHash('sha256').update(userId).digest('hex')` (satır 250–252) | `subjectRefOf` → aynı ifade (`subject-ref.ts:12`) |
| `src/actions/user/request-deletion.ts` | `createHash('sha256').update(userId).digest('hex')` (satır 258) | `subjectRefOf(userId)` |
| `src/actions/user/export-data.ts` | `createHash('sha256').update(userId).digest('hex')` (satır 240) | `subjectRefOf(userId)` |

Girdi `userId` olduğu gibi, önek/kırpma yok; kodlama varsayılan UTF-8; çıktı hex. Mevcut denetim satırlarındaki özet değerleri değişmez.

Bağımsız doğrulama (shasum ile):
```
printf abc       | shasum -a 256  → ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
printf user-due  | shasum -a 256  → 50d80fb5ceaa3d892af1bead1bf31312f4097f4e7f38851f2e7c7032ace994c8
```
Her iki değer `tests/subject-ref.test.ts`'de sabit vektör olarak da geçiyor.

## 2. Tek tanım kanıtı

`git grep` (PR head, `src/`): `.update(userId)` ile sha256 üreten TEK satır `src/lib/legal/subject-ref.ts:12`. Diğer `sha256` çağrıları farklı girdilerdir (API anahtarı, token, dosya hash'i, `promptHash` vb.) ve bu PR'ın kapsamı dışındadır.

## 3. Doküman iddiası ↔ kod

- `docs/DATA_MODEL.md` §7: "O kiracının `AuditEvent` satırları cascade ile silinir; `tenantId` boş satırlar kalır" → `prisma/schema.prisma` `AuditEvent.tenantId String?`, `tenant ... onDelete: Cascade`. **Uyumlu.**
- "AuditEvent için süre sınırı ve budama işi yok" → `git grep` ile `src/` ve `docs/` içinde AuditEvent budama işi yok. **Uyumlu.**
- "`purgeDueUsers` actorId'yi NULL'lar" → `users-scheduled-deletion.ts:154` (`auditEvent.updateMany ... actorId: null`). **Uyumlu.**
- `docs/legal/processing-register.md` §13 aynı mekanizmayı (actorId NULL, `user.erased` özeti) tarif ediyor. **Uyumlu.**
- `docs/DATA_MODEL.md` ~satır 958 (`agency.report.generated` notu, "budama kodu yok") §7 ile artık tutarlı.

## 4. Testler

Koşu: `perl -e 'alarm 900;exec @ARGV' pnpm exec vitest run ...` — PR head'in `git archive` kopyasında (paylaşılan çalışma ağacına dokunulmadı; `node_modules` simlink).

| Komut / dosya | Sonuç |
|---|---|
| `tests/subject-ref.test.ts` + `tests/users-scheduled-deletion.test.ts` | **19/19 geçti** |
| `tests/api/gdpr-500-body.test.ts`, `tests/server-action-rbac-guard.test.ts`, `tests/rls-coverage.test.ts` | geçti (ilk koşuda birlikte 153/154) |
| `tests/api/api-error-body-guard.test.ts` | ilk koşuda **1 test 30 sn varsayılan zaman aşımında düştü** (`no server action returns what it caught`, 54 sn). `--testTimeout=300000` ile yeniden koşuldu: **22/22 geçti** (34 sn). Assertion hatası değil, statik import taraması yavaş. PR'la ilgisi yok (test yalnızca `src/` taraması yapar, yeni modül kendi başına kırmıyor). |
| `pnpm typecheck` (`tsc --noEmit`) | **exit 0** |
| `eslint` (5 değişen dosya) | **exit 0** |
| `tests/gdpr-data-subject.live.test.ts` | koşulmadı — canlı DB gerektirir |
| Pre-push gate tam (E2E portu dahil) | **koşulmadı** — E2E portu ve canlı DB gerektirir. Merge öncesi lider/CI'da koşulmalı. |

Skipped: birim koşusunda atlanan test yok (19/19, 22/22).

## Bulgular

Düzeltme gerektiren bulgu **yok**.

**Not 1 (düşük, bloke etmez):** `tests/gdpr-data-subject.live.test.ts:389` ve `:591` kendi `createHash('sha256').update(ids.subject)` hesabını yapıyor. Bu bir test dosyası; sahada dördüncü bir kopya değil ama kart "dördüncü kopya çıkmasın" dedi. Bir sonraki işte `subjectRefOf` import edilebilir.

**Not 2 (düşük, bloke etmez):** `tests/subject-ref.test.ts`'deki "tek tanım" koruması yalnızca `.update(userId)` kalıbını arar. Girdi değişken adı farklı olan bir kopyayı yakalamaz. Mevcut kod için yeterli (tarama: `src/` içinde başka kişi-kimliği hash'i yok), ama koruma dar.

## Riskler

- Canlı DB ve tam pre-push gate koşulmadı; denetim kaydı davranışı canlıda (eski satırlarla) ölçülmedi. Hash eşdeğerliği kod ve sabit vektörlerle kanıtlandı, canlı satır karşılaştırması değil.
- Yavaş statik test (`api-error-body-guard`) varsayılan 30 sn'de kırılıyor; CI'da zaman aşımı artırılmazsa yanlış kırmızı verebilir (PR dışı, mevcut).

## Açık sorular

- Saklama/budama `AuditEvent` için istenirse ayrı karar ve iş gerekir (DATA_MODEL'in yeni metni bunu açıkça söylüyor).

## Sonraki adım

1. Lider/CI: tam pre-push gate (E2E portu) PR #134 head'inde koşulsun.
2. (İsteğe bağlı) Not 1 ve Not 2 ayrı küçük işte ele alınsın.
3. Gate temizse merge kararı patronda.

## Ham kanıt (özet)

```
vitest tests/subject-ref.test.ts tests/users-scheduled-deletion.test.ts → Tests 19 passed (19)
vitest tests/api/api-error-body-guard.test.ts --testTimeout=300000      → Tests 22 passed (22)
pnpm typecheck                                                          → EXIT 0
eslint <5 dosya>                                                        → EXIT 0
```
