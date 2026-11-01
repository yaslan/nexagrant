# TASK-MULZJG8IC7CRO — FB İNCELEME-8 (crw-fb)

**İncelenen kart:** TASK-MULU88PPI3HY3 (be-fb) · commit `d43794b8` · kaynak bulgular K-11/K-12 (docs/agent-results/TASK-MULT4H6G6LCQG-crw-fb.md)
**İnceleme anındaki HEAD:** `f626b2cf` (dev; `d43794b8..HEAD` arasında incelenen dosyalara dokunan commit yok)

## Karar: **ONAY**

Bloke eden (B) bulgu yok. DoD'nin iki maddesi de kendi koştuğum geçici DB ve kapılarla doğrulandı. Aşağıdaki Ö maddeleri isteğe bağlı iyileştirme; K maddeleri kapsam dışı notlar.

## (1) Ne yapıldı

- `d43794b8` diff'i satır satır okundu (drop-marketplace.sql, api-keys actions.ts / client.tsx, tests/modules/api-keys.test.ts).
- Kendime ait geçici Postgres konteyneri (`pgvector/pgvector:pg16`, `crwfb-mulz-pg`, port 55439) açıldı; paylaşılan `fabrika-postgres`'e hiçbir şey koşulmadı. `prisma db push --url …55439` ile taban şema, sonra `scripts/apply-migrations.sh` tam zincir. Makinede `psql` olmadığından `PSQL=` ile konteyner içindeki psql'e giden bir sarmalayıcı (scratchpad/dpsql) kullanıldı; script'in kendisi değiştirilmedi.
- K-11'in üç senaryosu ayrı ayrı; RLS iddiası (FORCE altında sahip rolü 0 görür) **süper-kullanıcı olmayan, NOBYPASSRLS bir sahip rolüyle** (`fbowner`) sınandı; süper-kullanıcı RLS'yi zaten atladığı için bu testi anlamsız kılardı.
- Kapılar: typecheck, lint, test (`set -a; source .env; set +a`), rls:bypass-check. Konteyner sonunda durduruldu (`--rm`).

## (2) Kanıt

### K-11 — drop-marketplace.sql

| Senaryo                                                                | Sonuç                                                                                                                   | Beklenen |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------- |
| A: tablolar yok, dosya iki kez                                         | `A run1 exit=0`, `A run2 exit=0` (yalnız "does not exist, skipping" NOTICE)                                             | ✅       |
| B: iki tablo boş, sahip=fbowner, FORCE RLS                             | `B exit=0`, ardından `tables\|\|` (ikisi de düştü)                                                                      | ✅       |
| C: dolu (başka kiracı satırları), fbowner FORCE altında `count(*)` = 0 | `ERROR: drop-marketplace: refusing to drop tables that hold rows: MarketplaceOrder=1 MarketplaceListing=2` · `C exit=3` | ✅       |
| C sonrası durum                                                        | iki tablo duruyor, `relforcerowsecurity` = `t` / `t`, satırlar 2 + 1 — NO FORCE geri alınmış                            | ✅       |
| C2: `PGOPTIONS='-c app.allow_marketplace_drop=on'`                     | `C2 exit=0`, tablolar düştü                                                                                             | ✅       |
| C3: C2'den sonra tekrar                                                | `C3 exit=0`                                                                                                             | ✅       |
| `app.allow_marketplace_drop=off` açıkça                                | yine `ERROR: … refusing …` (yalnız `on` geçer)                                                                          | ✅       |
| Kilit: `ALTER TABLE … NO FORCE ROW LEVEL SECURITY` bir tx içinde       | `AccessExclusiveLock` — sayım ile DROP arasında eşzamanlı INSERT giremez                                                | ✅       |

Kritik gözlem: `fbowner` FORCE altında `SELECT count(*)` → `0` döndü, blok ise `MarketplaceListing=2`, `MarketplaceOrder=1` saydı. Yorumdaki "FORCE'u kapatmadan sayım 0 okur" iddiası ve düzeltmesi gerçek.

### Tam zincir — `bash scripts/apply-migrations.sh`

```
RUN 1 (db push sonrası)                  exit=0   apply-migrations: 29 files applied
RUN 2 (tekrar)                           exit=0   apply-migrations: 29 files applied
RUN 3 (MarketplaceListing'de 1 satır)    exit=3   ==> [24/29] drop-marketplace.sql
                                                  ERROR: drop-marketplace: refusing to drop tables that hold rows: MarketplaceListing=1
RUN 4 (aynı + PGOPTIONS allow=on)        exit=0   apply-migrations: 29 files applied
RUN 5 (tekrar)                           exit=0   apply-migrations: 29 files applied
```

Zincirde `add-marketplace-order.sql` (22/29) `MarketplaceOrder`'ı her koşuda boş olarak yeniden kuruyor, `drop-marketplace.sql` (24/29) onu boş bulup düşürüyor; iki geçişin 0 çıkması buna dayanıyor ve öyle.

### K-12 — api-keys actions

- `generateApiKey` / `revokeApiKey`: `can(asRole(role), 'manage_users')` ilk satırda; red değer olarak dönüyor, oturumsuz çağrı hâlâ fırlatıyor. `settings/profile/actions.ts:25` ile aynı kalıp.
- İsim doğrulaması: `typeof name === 'string'` + trim + 1..100; kaydedilen değer trim'li.
- Tek yazma yolu bu mu? `grep -rnE "apiKey\.(create|delete|update|upsert)" src` → yalnız `actions.ts:52` (create), `actions.ts:78` (deleteMany) ve `src/lib/api-auth.ts:86` (update, lastUsedAt). Rolü atlayan başka bir anahtar üretme/silme yolu yok.
- `npx vitest run tests/modules/api-keys.test.ts` → `Tests 25 passed (25)`. Kapsam: OWNER/ADMIN üretir; PIPELINE_MANAGER/WRITER/MEMBER/GUEST_PARTNER üretemez ve silemez (create/deleteMany hiç çağrılmıyor); enum dışı rol (`SUPER_OWNER`) hiçbir şey vermiyor; boş/boşluk/101 karakter/sayı/undefined isim reddi; tam 100 kabul; trim kaydı.

### Kapılar (HEAD `f626b2cf`)

```
typecheck        exit=0
lint             exit=0   ✖ 3 problems (0 errors, 3 warnings) — üçü de src/lib/k3-topic-stats/importer.ts (se-fb'nin staged işi, kapsam dışı)
test             exit=1   Test Files 1 failed | 185 passed | 2 skipped (188) · Tests 5 failed | 2126 passed | 8 skipped (2139)
                          5 başarısızın 5'i de src/lib/agency/funnel.attack.test.ts — git'te izlenmeyen (??) fe-fb dosyası, bu kartla ilgisiz
rls:bypass-check exit=0   ✅ SUCCESS: no new tenant bypass. … 0 still owed.
```

Test kapısı ağaçtaki komşu işin izlenmeyen dosyası yüzünden kırmızı; `d43794b8`'in dokunduğu test dosyası tek başına 25/25 yeşil ve kalan 185 dosyada başarısız yok.

## Bulgular

### B — bloke eden

Yok.

### Ö — öneri (bloke etmez)

- **Ö-1 · `settings/api-keys/client.tsx:83-86` — bulunamayan anahtar da listeden siliniyor.** `revokeApiKey` başka kiracının ya da artık olmayan bir anahtar için `{ success: false }` (error alanı yok) döndürüyor; `'error' in res && res.error` yanlış olduğundan satır yine listeden kalkıyor ve kullanıcı iptal ettiğini sanıyor. Senaryo: iki sekmede aynı anahtar; birinde iptal, diğerinde tekrar iptal → ikincisi başarı gibi görünür (zararsız, anahtar zaten yok). Demo satırları (`key-1`, `key-2`) de bu yoldan kalkıyor; bu istenen davranış olabilir. Değişiklik öncesi de böyleydi. Öneri: `if (!res.success)` ile ayrıştırmak ya da bilinçli olduğunu yorumla yazmak.
- **Ö-2 · `client.tsx:183-187` vs `:255` — iptal reddi yanlış yerde görünüyor.** `forbidden` iptal hatası "Yeni API Anahtarı Oluştur" formunun içinde çıkıyor; iptal düğmesi sağdaki tabloda. Geniş ekranda görünür ama mobilde (`grid-cols-1`) form tablonun üstünde kalıyor, kullanıcı tıkladığı yerde geri bildirim görmüyor.
- **Ö-3 · `settings/api-keys/page.tsx` — rolsüz üye formu görüyor.** Sayfa rolü okumuyor; MEMBER formu doldurup ancak gönderince reddi öğreniyor. Sunucu tarafı doğru; `can(…,'manage_users')` sonucunu istemciye prop olarak geçip formu/iptal düğmesini gizlemek UX'i düzeltir.
- **Ö-4 · `drop-marketplace.sql:13` yorumu — PGOPTIONS kalıcılaşırsa bekçi susar.** Önerilen komut doğru (tek oturum), ama `scripts/apply-migrations.sh` ile verilince bayrak zincirdeki 29 dosyanın hepsinin oturumuna gidiyor ve bir CI/deploy ortam değişkenine konursa bekçi kalıcı olarak kapanır. Öneri: yoruma "ortam değişkenine kalıcı koyma, yalnız bu komut için ver" cümlesi.

### K — kapsam dışı notlar

- **K-1 · `src/lib/auth.ts:462,503` — rol JWT'den geliyor.** `requireTenantAction` rolü oturum token'ından okuyor; token yenilenene kadar rolü düşürülmüş bir yönetici `manage_users` taşımaya devam edebilir. Bu kartın getirdiği bir şey değil, `settings/profile` ile paylaşılan kalıp; token'ın ne sıklıkla yenilendiğini doğrulamadım (varsayım).
- **K-2 · Zincir etkisi.** Gerçek pazar yeri satırı olan bir DB'de zincir artık 24/29'da duruyor ve 25-29 uygulanmıyor. Bu, DoD'nin istediği davranış; yayın notunda (RELEASE_CHECKLIST) belirtilmesi iyi olur.

## (3) Değişen dosyalar

- `docs/agent-results/TASK-MULZJG8IC7CRO-crw-fb.md` (bu rapor). Kod değiştirilmedi.

## (4) Riskler

- İnceleme ağacında komşu işler var (se-fb staged topic-stats, fe-fb izlenmeyen funnel.attack.test.ts); test/lint çıktısındaki kırmızı/uyarılar onlara ait. Rapor commit'i yalnız bu dosyayı içeriyor (`git commit -- <rapor>`).

## (5) Açık sorular

- Ö-1: demo satırlarının iptal edilince listeden kalkması istenen davranış mı?

## (6) Sonraki adım

- Kart TASK-MULU88PPI3HY3 `done`'a alınabilir. Ö-1..Ö-4 isteğe bağlı küçük bir takip kartında toplanabilir.

## Platform beyanı

Doğrulama **macOS** (Darwin 27.0.0) üzerinde yapıldı; Postgres, Linux tabanlı `pgvector/pgvector:pg16` konteynerinde koştu. Değişen kod platformdan bağımsız: SQL sunucuda çalışıyor, `PGOPTIONS` libpq ortam değişkeni ve her platformdaki psql'de aynı şekilde okunuyor, server action / React kodunda dosya yolu, süreç ya da kabuk bağımlılığı yok. `scripts/apply-migrations.sh` bash gerektiriyor (Windows'ta WSL/Git Bash); Windows'ta koşulmadı, çünkü bu makinede Windows yok ve kartın dokunduğu script değişmedi.
