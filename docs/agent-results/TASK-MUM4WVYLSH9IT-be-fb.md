# TASK-MUM4WVYLSH9IT — FB KAMU B1: davet kodunda kullanım sınırı kaldırıldı (kod yoklama kanalı) — be-fb

**Sonuç:** Kullanım sınırı kaldırıldı. Kayıt formu üzerinden kod yoklama kanalı (crw-fb TASK-MUM3TMP8HU76G, Kart 1 Ö-1) kapandı. Kod artık yalnız son tarih (`expiresAt`, en fazla 1 yıl) ve iptal (`revokedAt`) ile yönetiliyor. Süresi dolmamış, iptal edilmemiş bir kod her denemede kabul ediliyor. Bu yüzden ret hiçbir zaman "tükendi" anlamına gelmiyor.

Migration, geçici DB'de ve paylaşılan dev DB'de ikişer kez rc=0 ile koştu. Down iki kez koştu ve HEAD'deki fonksiyon gövdelerini birebir geri getirdi (md5 eşit). Kapıların hepsi yeşil.

Canlı :3000'de formda `maxUses` alanı yok. leed-fb sunucuyu yeni Prisma client'ıyla yeniden başlattıktan sonra form üzerinden gerçek bir kod oluşturup iptal ettim. DB'de `maxUses = NULL` yazıldığını gördüm. İki akış için de ekran görüntüsü var.

## 1. Ne yapıldı

1. **Migration** `prisma/migrations/agency-invite-no-max-uses.sql` (+ `.down.sql`). `apply-order.txt` sonuna eklendi.
   - `redeem_agency_invite()`: `usedCount < maxUses` koşulu kaldırıldı. `CREATE OR REPLACE` ile yeniden yazıldı. Aynı imza, `SECURITY DEFINER`, `SET search_path = public, pg_temp`, `SET app.system_scope = 'on'`. `REVOKE PUBLIC` ve `GRANT fabrika_app` korundu.
   - `note_agency_invite_rejection()`: `'exhausted'` dalı kaldırıldı. Gövdenin geri kalanı `fix-agency-invite-rejection-audit.sql` ile aynı.
   - `"maxUses"` artık `DROP NOT NULL`. Yeni kod bu kolona NULL yazıyor, hiçbir kod onu okumuyor. **Hiçbir satır değiştirilmedi.**
   - `AgencyInviteCode_usedCount_bounds` artık `CHECK ("usedCount" >= 0)`. Kısıt **adı bilerek korundu**. Sebep: `apply-migrations.sh` her koşuda bütün zinciri baştan koşuyor. `add-agency-invite-code.sql` eski `usedCount <= maxUses` kısıtını yalnız bu adda bir kısıt yoksa ekliyor. Ad düşseydi, zincirin bir sonraki koşusu eski kısıtı geri eklerdi. O durumda eski sınırını aşmış tek bir kod bile migration'ı kırardı. Aşağıdaki RUN3 bunu doğruluyor.
2. **Şema** (`prisma/schema.prisma`): `maxUses Int?` yapıldı, emekli kolon olarak belgelendi. Kolonu şemadan tamamen kaldırmadım:
   - Kaldırmak yıkıcı olurdu ve down'da eski değerler geri gelmezdi.
   - Görev "kalabilir" diyor.
   - İleride düşürülecekse bu ayrı bir kart olmalı.
3. **Kod:**
   - `src/lib/agency/codes.ts`: `maxUses` girdisi ve `INVALID_MAX_USES` kaldırıldı. `validateInviteCodeInput` yalnız son tarihi doğruluyor (yarından itibaren, en fazla `MAX_VALIDITY_DAYS = 366` gün). Denetim olayı (`agency.invite.created`) artık `maxUses` taşımıyor. `InviteCodeSummary` ve `CreatedInviteCode` içinden `maxUses` çıktı.
   - `src/lib/agency/actions.ts` ve `src/app/[locale]/(app)/ajans/actions.ts`: `maxUses` girdisi ve `invalidMaxUses` hatası kaldırıldı.
   - `src/lib/agency/code-limits.ts` silindi (`MIN_MAX_USES` ve `MAX_USES_LIMIT` gereksizleşti).
   - `invite-codes-panel.tsx`: kullanım sınırı alanı ve tablodaki "Kullanım sınırı" sütunu kaldırıldı. Son tarih için varsayılan **30 gün** (önceden 90). Tarih alanının `max` değeri bugün + 365 olarak kaldı.
   - i18n (tr/en): `maxUses`, `maxUsesHint`, `colLimit`, `limit` ve `errors.invalidMaxUses` silindi. `tableCaption` ve `countsNote` güncellendi. `countsNote` artık "sınır yok; kısa son tarih seçin, sızarsa iptal edin" diyor.
   - `src/lib/agency/funnel.ts`: yorum güncellendi. Artık yeni `'exhausted'` satırı yazılmıyor, ama eskileri duruyor.
   - `docs/DATA_MODEL.md` §AgencyInviteCode güncellendi.
4. **Saldırgan testi** (`src/lib/agency/funnel.attack.test.ts`):
   - Kod paneli modelinde `used ≤ maxUses` kısıtı kalktı. Panelin gönderdiği bir sınır yok, dolayısıyla `hi = ∞`.
   - Saldırgana yeni bir bilgi kaynağı eklendi: **kayıt formu yoklaması** (`FormRule`, `probe()`). Saldırgan kendi her kodunu formda dener. Kuralı bildiği için, "kabul" ya da "ret" cevabıyla tutarlı kullanım aralığını hesaplar.
   - `FORM_NOW` yeni SQL kuralının aynısı: iptal yoksa ve süre dolmadıysa kabul.
   - `FORM_WITH_LIMIT` eski kural. Yalnız pozitif kontrol için var.
   - Özellik kapısı (3 tohum × {D ≥ 0, D = 0} × {rastgele, art arda 6'lık} × 300 tablo) artık form yoklamasıyla koşuyor.
   - Rastgele kodların bir kısmı eski sınırı kolonda taşıyor, bir kısmı o sınırı aşmış durumda.
   - K-1 düzeltildi: test adı `'one much-used code: the panel reads "active"…'` oldu.
5. **Live test** (`tests/agency-invite.live.test.ts`, `fabrika_app` NOBYPASSRLS):
   - Sınır testleri, sınırsızlık testleriyle değiştirildi: 30 art arda kullanım, eski sınırını aşmış kodun çalışması, iki bağlantının ikisinin de geçmesi, 12 paralel kullanımın hepsinin geçmesi.
   - Yeni **yoklama** testi eklendi.
   - Ret denetim satırı testinde artık `'exhausted'` yok.

## 2. Kanıt

### Migration: geçici DB'de iki kez 0 ve down (fabrika-postgres üzerinde `befb_mum4_tmp`, sonra DROP)

Kurulum: HEAD şeması (`git show HEAD:prisma/schema.prisma`) ile `db push`, ardından HEAD migration zinciri (29 dosya, rc=0). Tükenmiş bir kod eklendi (max 6, used 6).

```
before: redeem exhausted legacy ->|NULL
RUN1 rc=0   apply-migrations: 30 files applied
nullable=YES
AgencyInviteCode_maxUses_positive: CHECK (("maxUses" > 0))
AgencyInviteCode_usedCount_bounds: CHECK (("usedCount" >= 0))
note_agency_invite_rejection secdef=true cfg=search_path=public, pg_temp,app.system_scope=on maxUses_in_body=false md5=371daffb…
redeem_agency_invite secdef=true cfg=search_path=public, pg_temp,app.system_scope=on maxUses_in_body=false md5=8f1b95d7…
grant fabrika_app: true,true
rows: legacy max=6 used=6
db push (new schema) rc=0
RUN2 rc=0   apply-migrations: 30 files applied
snap1 == snap2
after: redeem legacy (was exhausted) ->|ag1
RUN3 (legacy used 50 > old max 6) rc=0   apply-migrations: 30 files applied
insert without maxUses OK
UPDATE usedCount=-1 → ERROR: … violates check constraint "AgencyInviteCode_usedCount_bounds"
DOWN1 rc=0 · DOWN2 rc=0 · down1 == down2
  nullable=NO · usedCount_bounds: CHECK ((("usedCount" >= 0) AND ("usedCount" <= "maxUses")))
  note md5=58071e97… · redeem md5=6bfcc2ee…   ← HEAD zinciriyle kurulan ayrı DB'de de aynı md5
  rows: legacy max=50 used=50; new1 max=10000 used=0
FORWARD again rc=0 · forward-after-down == snap2 (schema/functions)
temp DBs dropped
```

### Paylaşılan dev DB (fabrika)

Komut: `psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -f prisma/migrations/agency-invite-no-max-uses.sql`, iki kez.
Geri alma: `psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -f prisma/migrations/agency-invite-no-max-uses.down.sql`. Bu komut veri değiştirir; önce R-3'teki kontrol sorgusunu koşun.

```
dev before: codes=2 at_or_past_limit=1 null_max=0
dev apply 1 rc=0
dev apply 2 rc=0
AgencyInviteCode_usedCount_bounds: CHECK (("usedCount" >= 0)) · nullable=YES
dev after: codes=2 at_or_past_limit=1   (satır değişmedi)
```

### Canlı test (fabrika_app): N kez kullanım, ret tek tip

`vitest run src/lib/agency src/app/[locale]/(app)/ajans tests/agency-invite.live.test.ts tests/agency-funnel.live.test.ts` → `Test Files 7 passed (7) · Tests 89 passed (89)`, atlanan test yok. İlgili satırlar (verbose):

```
✓ no use limit: a live code works N times in a row, and the counter keeps count          (N = 30, maxUses NULL)
✓ a code made under the old limit and used past it still works: the old limit is not read
✓ two connections on one code: the row lock serialises them, both win, no use is lost
✓ a burst of 12 parallel registrations on one code: all 12 succeed and are counted
✓ probing (TASK-MUM3TMP8HU76G Ö-1): a much-used code answers like a fresh one; only revoke or expiry refuses, with the same NULL
✓ a revoked code is filed under its agency; no "exhausted" reason; an unknown one leaves no tenant-readable row
```

### Saldırgan testi (yoklama "bilgi yok")

```
✓ probing the registration form > positive control: under a use limit the form says "refused" ×4, and the fifth code is read back as 2..3
✓ probing the registration form > no use limit: every live code is accepted, so the form tells nothing the panel does not (D = 0 and D ≥ 0)
✓ probing the registration form > "no information": the form answer is a function of the status the panel already shows, at any use count
✓ former residual closed: codes made with a limit under 5 no longer bound their uses to 1..4
✓ property … seed {1,7,42} × {D ≥ 0, D = 0} × {random codes, sequential codes of 6}: 300 tables — 12/12 yeşil
```

Mutasyon kontrolü: özellik kapısında `FORM_NOW` geçici olarak `FORM_WITH_LIMIT` yapıldı, sonra dosya geri alındı. Sonuç: art arda 6'lık modda 6 koşunun 6'sı da kırmızıya döndü (`3/300`, `6/300 tables leak`, örnek `#71 code#4=3 ∈ [2, 3]`). Yani kapı, yoklama kanalını görebiliyor. Rastgele modda eski kural, eski sınırını aşmış kodlarla tutarsız düştü (`infeasible`). Bu beklenen sonuç: o veri sınırlı dünyada oluşamaz.

### Kapılar (`set -a; source .env; set +a`)

| Kapı                               | Sonuç                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `prisma generate`                  | rc=0                                                                                        |
| `typecheck`                        | rc=0                                                                                        |
| `lint`                             | rc=0                                                                                        |
| `vitest run` (tamamı)              | rc=0 — `Test Files 191 passed \| 2 skipped (193)` · `Tests 2221 passed \| 8 skipped (2229)` |
| `rls:check`                        | rc=0 — "every one of them carries ENABLE + FORCE + tenant_isolation"                        |
| `rls:bypass-check`                 | rc=0 — "no new tenant bypass … 0 still owed"                                                |
| `rls:verify`                       | rc=0 — "47 kiracıya özel tabloda … fabrika_app rolüyle GERÇEKTEN ölçüldü"                   |
| `i18n:check`                       | rc=0 — "both catalogs agree, every key used in src/ resolves"                               |
| `apply-migrations` (geçici DB, ×3) | rc=0 / rc=0 / rc=0                                                                          |

### Canlı :3000 (leed-fb'nin sunucusu, demo hesabı `b2v0219-ajans@example.org`, TENANT_OWNER, AGENCY)

Gerçek Chrome (Playwright `channel: 'chrome'`) ile form girişi yapıldı, ardından `/tr/ajans` açıldı:

```
{"numberInputs":0,"inputs":["date","text"],"labels":["Son geçerlilik günü","Etiket (isteğe bağlı)"],
 "kullanimSiniriText":0,"headers":["Kod","Etiket","Son geçerlilik","Durum","İşlemler"],
 "dateDefault":"2026-10-29","today":"2026-09-29"}
```

Ekran görüntüsü: `docs/agent-results/TASK-MUM4WVYLSH9IT-screenshots/kod-olusturma-maxuses-yok.png`. Formda yalnız son tarih (varsayılan 29.10.2026, yani +30 gün) ve etiket var. Tabloda sınır sütunu yok, yeni açıklama metni görünüyor.

İlk denemede "Kod üret" "İşlem tamamlanamadı" döndürdü. Sebep: çalışan süreç eski Prisma client'ını belleğinde tutuyordu ve o client'ta `maxUses` zorunluydu. leed-fb sunucuyu yeniden başlattı (/tr 200, /tr/kayit 200). Sonra aynı akışı gerçek tıklamayla yeniden koştum:

```
created hint VDN2
row ["••••-••••-VDN2","be-fb MUM4 canlı test","30 Eki 2026","Etkin","İptal et"]
row after revoke ["••••-••••-VDN2","be-fb MUM4 canlı test","30 Eki 2026","İptal edildi",""]
DB: hint=VDN2 maxUses=NULL used=0 revoked=true
audit: agency.invite.created {"expiresAt": "2026-10-29T23:59:59.000Z"}   ← maxUses yok
audit: agency.invite.revoked
```

Ekran görüntüsü: `kod-olusturuldu.png`. Karede kodun düz metni görünüyor, ama kod hemen ardından iptal edildi; dev verisi, değeri yok. Dev DB'ye bu tek iptal edilmiş test kodu eklendi.

Tabloda "30 Eki" görünmesi bu işe ait değil, önceden var olan bir davranış: son geçerlilik günü 23:59 UTC'dir, Türkiye saatiyle ertesi gün 02:59'a denk gelir.

## 3. Değişen dosyalar

- `prisma/migrations/agency-invite-no-max-uses.sql` (yeni)
- `prisma/migrations/agency-invite-no-max-uses.down.sql` (yeni)
- `prisma/migrations/apply-order.txt`
- `prisma/schema.prisma`
- `src/lib/agency/codes.ts`, `src/lib/agency/actions.ts`, `src/lib/agency/funnel.ts` (yorum)
- `src/lib/agency/code-limits.ts` (silindi)
- `src/app/[locale]/(app)/ajans/actions.ts`, `src/app/[locale]/(app)/ajans/invite-codes-panel.tsx`
- `messages/tr.json`, `messages/en.json`
- `src/lib/agency/codes.test.ts`, `src/app/[locale]/(app)/ajans/actions.test.ts`, `src/lib/agency/funnel.attack.test.ts`, `tests/agency-invite.live.test.ts`
- `docs/DATA_MODEL.md`
- `docs/agent-results/TASK-MUM4WVYLSH9IT-be-fb.md`, `docs/agent-results/TASK-MUM4WVYLSH9IT-screenshots/`

## 4. Riskler

- **R-1 Kötüye kullanım: sınırsız kod sızarsa istenmeyen kayıtlar açılabilir.**
  - Bir kod bir etkinlikte paylaşılır, bir WhatsApp grubuna ya da açık web'e düşerse, son tarihe kadar herkes o kodla ücretsiz Keşif hesabı açıp ajansa bağlanabilir. Sayısal bir tavan artık yok.
  - Önlemler:
    - Ajansın iptal yetkisi: tek tık, anında etkili, kayıtlı kurumlar etkilenmez.
    - Kısa son tarih: UI varsayılanı 30 gün, üst sınır 1 yıl.
  - **Oran sınırı yok.** Kayıt uç noktasının önünde IP ya da e-posta hız sınırı da yok (B1 raporundaki risk hâlâ geçerli).
  - Sızan kodla açılan sahte kurumlar ajansın funnel sayılarını şişirir. Bu kurumların hiçbir satırını ajans okuyamaz.
  - Tespit: kod başına kullanım sayısı ajansa gösterilmiyor (B-1). Sızıntıyı ajans ancak funnel toplamının beklenmedik artışından görür. Platform tarafında `usedCount` iç sayacı okunabilir. Bir platform alarmı eklemek (kod başına günlük kullanım eşiği) ayrı bir kart olabilir.
- **R-2 Eski satırlar.**
  - Dev DB'de sınırına ulaşmış 1 kod vardı (crw-fb K-2). Bu kod artık **yeniden kullanılabilir**, çünkü sınır okunmuyor.
  - Pilot DB'de aynı durum olursa, eskiden "tükenmiş" olan kodlar süreleri dolmadıysa yeniden açılır.
  - Öneri: pilot öncesi, eski sınırına ulaşmış ve süresi dolmamış kodlar ajansa sorulsun ya da iptal edilsin. Sorgu: `SELECT id FROM "AgencyInviteCode" WHERE "usedCount" >= "maxUses" AND "revokedAt" IS NULL AND "expiresAt" > now()`.
- **R-3 Down veri değiştirir.**
  - Sınırsız kodlara `GREATEST(usedCount, 10000)` yazar.
  - Eski sınırını aşmış kodlara `maxUses = usedCount` yazar, yani bu kodlar tükenir.
  - Down yoklama kanalını yeniden açar. Bunların hepsi down dosyasının başlığında yazılı, önce koşulacak kontrol sorgusu da orada.
- **R-4** `'exhausted'` sebepli eski `agency.invite.rejected` satırları ajans kiracısında duruyor. Bunları gösteren bir ekran yok. `funnel.ts` yorumu, böyle bir ekranın saldırgan kapısından geçmesi gerektiğini hâlâ söylüyor.
- **R-5 Yayın sırası.** Yeni kod, yeni Prisma client'ı ister. Migration'ı uygulayıp sunucuyu yeniden başlatmadan yeni kodu çalıştırmak ya da tersi, kod oluşturmayı bozar. Dev'de bu yaşandı ve yeniden başlatmayla çözüldü. Doğru sıra: önce migration, sonra deploy/restart. Eski kod da yeni DB'de çalışır, çünkü eski kod `maxUses` yazar ve kolon nullable olsa da değer kabul eder.

## 5. Açık sorular

1. **HUKUK-5 eki (`docs/legal/agency-channel-notice-addendum.md`), DOKUNULMADI.** Kod kullanım sınırından bahsettiği yerler:
   - :54 kod paneli tablosu: "etiket, son 4 karakter, **üst sınır**, son tarih, durum". Üst sınır artık yok, ne panelde ne kodda.
   - :108 "Bir kodun kaç kez kullanıldığı **ve kullanım sınırına ulaşıp ulaşmadığı**…". Sınır olmadığı için ikinci kısım anlamını yitirdi.
   - :136 (TASK-MUM17YBJVAHRR notu) "en az 6 kullanımlık kod" kuralı ve R-1 ("minimumdan önce üretilmiş kodlar"). Kural artık yok. R-1 kalıntısı kapandı ve saldırgan testiyle doğrulandı.
   - :138 ("tükendi" kaldırıldı notu) ve crw-fb'nin işaret ettiği "ajans tükenen kodu **ancak**… öğrenir" cümlesi. Kayıt formu kanalı artık kapalı. Yerine "sınır yok; iptal + kısa son tarih; sızıntı riski (R-1 yukarıda)" konmalı.
   - cs-fb'nin TASK-MUM3WSS7DOGJL kartı günceller.
   - `processing-register.md` içinde sınırdan söz eden bir satır bulamadım.
2. `maxUses` kolonu şemadan tamamen düşürülsün mü? Önerim: pilot sonrası ayrı bir kart. Down'da kayıp değer olur, acelesi yok.

## 6. Sonraki adım

- cs-fb (TASK-MUM3WSS7DOGJL): ekteki §5.1 maddelerini güncellesin.
- Pilot DB kurulurken R-2 sorgusu koşulsun.
- İsteğe bağlı kart: kod başına günlük kullanım için platform alarmı (R-1 tespiti).

## Platform beyanı

**macOS (Darwin 27, Apple Silicon)** üzerinde doğrulandı: Docker `fabrika-postgres` (PostgreSQL), Node 26, Chrome ile :3000. Değişiklik platformdan bağımsız: SQL, TypeScript sunucu kodu ve React formu. Dosya yolu, süreç ya da kabuk bağımlılığı yok. Windows ve Linux'ta koşulmadı (bu makinede yok), ama davranış farkı beklenmez. CI (Linux) aynı `db push` + `apply-migrations.sh ×2` zincirini koşar. Bu zincir yerelde üç kez rc=0 verdi.
