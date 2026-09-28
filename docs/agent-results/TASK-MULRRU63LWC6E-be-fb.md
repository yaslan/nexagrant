# TASK-MULRRU63LWC6E — FB KAMU B7: Başvuru ve sonuç beyanı (be-fb)

Sprint FB-KAMU-2 · dal `dev` · push yok.

## 1. Ne yapıldı

### Keşif: mevcut alanlar

Şema değişikliği gerekmedi. Alanlar zaten vardı; üründe onları **yazan hiçbir yol yoktu**.

| Alan                                                                                               | Nerede                                               | Bugün kim okuyor                                                 | Bugün kim yazıyor (B7 öncesi)                      |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------- |
| `Proposal.submittedAt DateTime?`                                                                   | prisma/schema.prisma `model Proposal`                | M5 KPI isabet oranı payı (`src/modules/m5/server/queries.ts` #2) | Yalnız seed'ler                                    |
| `Proposal.outcome String?`                                                                         | aynı; kelime dağarcığı `src/lib/proposal-outcome.ts` | panel `countOutcomes` (`src/lib/dashboard/fetch-metrics.ts`)     | Yalnız M6 ESR ayrıştırıcı: `above_threshold/below` |
| `Opportunity.status OppStatus` (`ACTIVE, WITHDRAWN, SUBMITTED, FUNDED, REJECTED, ABOVE_THRESHOLD`) | prisma/schema.prisma                                 | detay ekranında rozet olarak                                     | Yalnız `createOpportunity` → `ACTIVE`              |
| `Opportunity.stage Gate` (G0–G4)                                                                   | aynı                                                 | pano                                                             | kapı motoru, sürükle-bırak                         |

`grep -rn "submittedAt\|status: 'SUBMITTED'\|'FUNDED'\|'REJECTED'"` src/ altında Proposal/Opportunity için yazan satır bulmadı (bulunanlar dual-approval ve M6 panel skoruna ait).

**Karar:** beyan = `Proposal.submittedAt` (gönderim; M5 zaten okuyor) + `Opportunity.status` `SUBMITTED → FUNDED | REJECTED` (enum tam bunun için çizilmiş). `Proposal.outcome`'a **dokunulmadı**: o sütun ESR değerlendirme bandını taşıyor (`above_threshold/below`); "fon veren kabul etti" ayrı bir soru, aynı sütuna ikinci yazar koymak çelişki üretirdi.

### Durum makinesi (saf, testli) — `nextApplicationStatus`

```
ACTIVE ──gönderildi──▶ SUBMITTED ──kabul──▶ FUNDED
                                  └─red────▶ REJECTED     (FUNDED ⇄ REJECTED düzeltme serbest)
```

- Gönderim olmadan sonuç: `NOT_SUBMITTED` (huni huni olarak kalsın: accepted ⊆ submitted).
- Sonuç girildikten sonra yeniden "gönderildi": `ALREADY_DECIDED` (sonucu sessizce silerdi).
- `WITHDRAWN`: beyan yok. Aynı beyanı tekrar etmek no-op (çift tık güvenli), ilk gönderim tarihi korunur.

### Yazma yolu — `declareApplication` server action

`src/app/[locale]/(app)/[workspace]/pipeline/actions.ts`: Zod girdi, tenant yalnız oturumdan, `withTenant` içinde `findFirst({id, tenantId, deletedAt:null})`, yetki `canArchiveOpportunity` ile aynı kural (pipeline rolleri ya da kartın sahibi; GUEST_PARTNER sahibi değilse reddedilir), Proposal yoksa oluşturulur, durum `updateMany({id, tenantId})`, her durum değişikliğine aynı transaksiyonda `AuditEvent` `opportunity.application_declared` (`{declaration, from, to}` — kişisel veri yok).

### Arayüz

Fırsat detayı (`/[workspace]/pipeline/[id]`) → Genel Bakış → **"Başvuru beyanı"** paneli: mevcut durum + "Gönderildi olarak işaretle" / "Kabul edildi" / "Reddedildi". tr/en çevirileri `Pipeline.detail.application.*`.

### Sayaç — `countApplicationOutcomes`

`src/lib/k5-pipeline/applicationOutcome.ts`

```ts
countApplicationOutcomes(tenantIds: string[], since?: Date): Promise<{ submitted; accepted; rejected }>
```

- Toplam döner, kiracı başına kırılım ve satır içeriği yok.
- `since` **gönderim tarihine** uygulanır: üç sayı tek kohort (o tarihten beri gönderilenler).
- Arşivli fırsat ve silinmiş (KVKK) proposal sayılmaz.
- **Kapsam:** her kiracı kendi `withTenant`'ı içinde, sırayla okunur → RLS NOBYPASSRLS rolde de geçerli; **system scope gerekmedi, bypass baseline'a giriş eklenmedi** (`rls:bypass-check` 0 yeni).
- Tekrarlar tekilleştirilir, boş liste 0/0/0, boş id `MissingTenantScopeError`.
- Proposal-outcome.ts yerine ayrı modül: o dosya saf, test/betiklerce import ediliyor; `@/lib/db` çekmemeli. `server-only` paketi repoda yok; leed-fb eklenmemesine karar verdi, `@/lib/db` importu yeterli koruma kabul edildi.
- İmza fe-fb'ye (alan-39) ve leed-fb'ye (alan-c2) SendMessage ile bildirildi.

## 2. Kanıt

### Gerçek tarayıcı (leed-fb'nin :3000 sunucusu, alice@fabrika.test, PIPELINE_MANAGER, kiracı `fabrika-beta`)

Paylaşımlı demo fırsatlarına (ör. `demo-opp-4`) dokunmamak için kendi fikstürüm açıldı: `B7 doğrulama — TASK-MULRRU63LWC6E` (id `cmulv7cc10000flxkebaickhy`), doğrulamadan sonra silindi.

`countApplicationOutcomes(['<fabrika-beta>'])` her adımdan sonra:

| Adım                             | Panel metni (`read`)         | Sayaç                                      | Kare                                                       |
| -------------------------------- | ---------------------------- | ------------------------------------------ | ---------------------------------------------------------- |
| Başlangıç                        | Henüz gönderilmedi           | `{submitted: 2, accepted: 0, rejected: 0}` | `TASK-MULRRU63LWC6E-be-fb-shots/01-henuz-gonderilmedi.png` |
| "Gönderildi olarak işaretle" tık | Gönderildi, sonuç bekleniyor | `{submitted: 3, accepted: 0, rejected: 0}` | `02-gonderildi.png`                                        |
| "Kabul edildi" tık               | Kabul edildi                 | `{submitted: 3, accepted: 1, rejected: 0}` | `03-kabul.png`                                             |
| "Reddedildi" tık (düzeltme)      | Reddedildi                   | `{submitted: 3, accepted: 0, rejected: 1}` | `04-red-duzeltme.png`                                      |
| Fikstür silindikten sonra        | —                            | `{submitted: 2, accepted: 0, rejected: 0}` | —                                                          |

DB durumu kabulden sonra (kopya):

```
{"opp":{"status":"FUNDED","proposal":{"submittedAt":"2026-09-28T23:14:56.497Z"}},
 "audit":[{"type":"opportunity.application_declared","data":{"to":"SUBMITTED","from":"ACTIVE","declaration":"submitted"}},
          {"type":"opportunity.application_declared","data":{"to":"FUNDED","from":"SUBMITTED","declaration":"accepted"}}]}
```

Temizlik çıktısı: `{"audit":{"count":3},"opp":{"count":1}}` (yalnız kendi fikstürümün satırları; proposal cascade ile gitti).

### Testler

- `tests/application-outcome.test.ts` — durum makinesi, 7 test.
- `tests/application-outcome.live.test.ts` — gerçek Postgres, `declareApplication` + `countApplicationOutcomes` uçtan uca, 9 test: sıfırdan başlama, gönderimsiz sonuç reddi (yazmaz), A+B toplamı 4/1/1 (listede olmayan C'nin kabulü sayılmaz), tekrarlı id, boş liste, ilk gönderim tarihinin korunması, başka kiracının fırsatına beyan → `OPPORTUNITY_NOT_FOUND`, sahibi olmayan GUEST_PARTNER → `DECLARE_FORBIDDEN`, `since` gönderim tarihine göre, arşivli fırsatın düşmesi, audit satır sayısı 5.

```
$ set -a; source .env; set +a; pnpm vitest run tests/application-outcome.test.ts tests/application-outcome.live.test.ts
 Test Files  2 passed (2)
      Tests  16 passed (16)

$ pnpm test
 Test Files  178 passed | 2 skipped (180)
      Tests  2045 passed | 8 skipped (2053)

$ pnpm typecheck      → tsc --noEmit, çıktı yok (exit 0)
$ pnpm lint           → eslint, exit 0
$ pnpm rls:bypass-check
✅ SUCCESS: no new tenant bypass. 1 call site(s) allowed with a recorded reason, 23 on the sanctioned cross-tenant path, 0 still owed.
$ pnpm i18n:check
✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
```

## 3. Değişen dosyalar

- `src/lib/k5-pipeline/applicationOutcome.ts` (yeni) — durum makinesi + `countApplicationOutcomes`
- `src/app/[locale]/(app)/[workspace]/pipeline/actions.ts` — `declareApplication`
- `src/app/[locale]/(app)/[workspace]/pipeline/[id]/client.tsx` — "Başvuru beyanı" paneli
- `messages/tr.json`, `messages/en.json` — yalnız `Pipeline.detail.application` bloğu (dosyalardaki fe-fb'ye ait commit'lenmemiş `agency`/`Forbidden` anahtarları bu commit'e **alınmadı**; index'e HEAD + yalnız bu blok kondu)
- `tests/application-outcome.test.ts`, `tests/application-outcome.live.test.ts` (yeni)
- `docs/agent-results/TASK-MULRRU63LWC6E-be-fb-shots/*.png`, bu rapor

Şema / migration / `src/lib/agency/funnel.ts`: dokunulmadı.

## 4. Riskler

- **`tenantIds` güveni (leed-fb notu):** `countApplicationOutcomes` verilen listeye güvenir ve listedeki her kiracı için cevap verir. `tenantIds` SUNUCUDA, çağıranın yetkili kapsamından türetilmeli (ör. oturumdaki ajans kiracısının `Tenant.agencyId` üyeleri); istemci girdisi asla geçirilmemeli. JSDoc'ta yazılı; doğrulama ve testi funnel.ts tarafında fe-fb'de.
- **Beyan doğrulanmış olgu değil:** kurumun kendi beyanı. Rapora "kurum beyanı" diye girmeli (OKA §4 zaten öyle diyor).
- **İki "sonuç" kaynağı:** panelin "fonlanan" sayısı (`fetch-metrics.countOutcomes`) `Proposal.outcome === 'funded'` okur; B7 kabulü `Opportunity.status = FUNDED` yazar. Bugün `funded` yazan bir yol olmadığı için o sayaç zaten 0; ileride biri ESR'den `funded` yazarsa iki sayaç ayrışabilir. Bilinçli olarak `outcome`'a yazılmadı (bkz. §1 Karar).
- **Sıralı okuma:** kiracılar tek tek okunur (havuz koruması). Ajans başına onlarca kiracıda sorun yok; yüzlerce kiracıda tek sorgulu bir system-scope `platform-aggregate` sürümü düşünülebilir (baseline girişi ile).
- **Bir kez kaybolan tık:** doğrulamada ilk "Kabul edildi" tıklaması sunucuya hiç ulaşmadı (audit satırı yok); ikinci tık çalıştı. "Reddedildi" ile aynı sırayı tekrarlayınca yeniden üretilemedi (yalnız ~1 sn render gecikmesi). Muhtemelen `router.refresh()` sonrası yeniden render ile tarayıcı aracının tık zamanlaması çakıştı; ürün hatası olduğu kanıtlanmadı.

## 5. Açık sorular

- Ajans raporunda "sonuç" için tarih gerekirse (ör. "bu ay kabul edilenler"): bugün sonuç zamanı ayrı sütunda değil, yalnız `AuditEvent.createdAt`'te. Gerekirse `Proposal.decidedAt` additive migration'ı (devop-fb/leed-fb kararı).
- `WITHDRAWN` / `ABOVE_THRESHOLD` durumlarını üründe yazan yol hâlâ yok; B7 kapsamı dışında bırakıldı.

## 6. Sonraki adım

- fe-fb: `src/lib/agency/funnel.ts` adım 6-7'yi `countApplicationOutcomes` ile doldursun (yetkili `tenantIds` ile).
- se-fb: istenirse detay panelindeki `data-testid="pipeline-declare-*"` düğmeleri için e2e.

## Platform beyanı

Doğrulama **macOS** (Darwin 27.0, Node 26.5) üzerinde yapıldı: :3000 dev sunucusu, AgentSpace dahili tarayıcı, yerel Postgres. Değişen kod platforma bağlı değil (dosya yolu, süreç, kabuk, kısayol, DPI yok: Prisma sorgusu + React paneli + i18n); Windows/Linux'ta aynı davranması beklenir, bu platformlarda **koşulmadı** (makinede yalnız macOS var).
