---
sözleşme: 3
görev: TASK-MVCH1YZXDOED
kod: TASK-MVCH1YZXDOED
ajan: crw-fb
motor: claude
tip: diğer
okur: ekip
hüküm: Bitti: 0a654b99 onaylandı, bloke eden bulgu yok; dev'e taşırken 4 mekanik çakışma var ve match-pic'in bulanık eşlemesi K2 bağlanmadan önce sıkılaştırılmalı.
platform: mac (Darwin 27). Statik inceleme, vitest ve rls:check koşuldu. Kodda platforma bağlı bir yol yok (SQL + saf TS); Windows/Linux koşulmadı çünkü bu makinede yok, sonuç değişmez. Migration'ı DB'de kendim yeniden koşamadım: .env okuma izni reddedildi; DB kanıtı için be-fb raporuna dayandım.
sürüm: 1
tarih: 2026-10-21T16:09:17.434Z
---

# FO-58 PS-K1 — Kod incelemesi (crw-fb)

**İncelenen:** `0a654b99` · dal `be-fb/fo58-partner-search-model` · worktree `.claude/worktrees/fo58-ps-model` · yazar raporu `/Users/macbook/alan/docs/agent-results/TASK-MVCH1YZXDOED-be-fb.md`

## Karar
**ONAY. Bloke eden bulgu yok.** Aşağıdaki D1, `matchPic` K2 ingestor'a bağlanmadan önce düzeltilmeli. D2, dev'e taşıyan kişinin izlemesi gereken talimattır. Ö-maddeleri öneridir.

## Ne yapıldı
- `git show 0a654b99` satır satır okundu: şema, migration, down, rls.sql, rls-models, test ve DATA_MODEL.
- Bu dalda `match-pic` ve `rls-coverage` testleri koşuldu. `prisma validate` hem dalda hem dev ile birleşmiş şemada çalıştırıldı.
- Tek commit'lik cherry-pick, origin/dev üzerinde scratchpad'de ayrı (detached) bir worktree'de denendi. Çakışmalar çözüldü; testler ve `rls:check` orada da koşuldu. Ardından worktree silindi.
- `match-pic` eşiği gerçek kurum adı çiftleriyle ölçüldü. Bunun için geçici bir test dosyası kullanıldı ve hemen silindi. İncelenen worktree temiz kaldı (`git status` boş).

## Kabul kriterleri (kart, 9 madde)
| # | Kriter | Durum |
|---|---|---|
| 1 | PartnerSearchAnnouncement, alanlar ve 5 indeks | ✅ externalId unique, FK→Topic.identifier (Topic.identifier `@unique`, :535). `country`/`description`/`publishedAt` nullable; ingestor için makul bir sapma. |
| 2 | PartnerProfileSnapshot | ✅ PK `pic` |
| 3 | IngestionRun + UnmatchedOrganization | ✅ upsert için `matchKey` unique eklenmiş (yerinde bir ek) |
| 4 | PartnerSearchTopicStat, kişi satırı yok | ✅ |
| 5 | CordisOrganization'a 3 additive alan | ✅ |
| 6 | QuotaUsage + RLS | ✅ migration ve rls.sql'de ENABLE+FORCE+tenant_isolation, FK Tenant CASCADE |
| 7 | SYSTEM_WIDE | ✅ 5 tablo |
| 8 | match-pic + test | ✅ 16 test: tam, fuzzy, unmatched, eşit aday. Bkz. D1 |
| 9 | Down SQL + DATA_MODEL | ✅ §22. Dev'e taşırken §24 olmalı (D2) |

## Odak kontrolleri
- **İdempotentlik:** enum'lar `duplicate_object` ile, tablo ve indeksler `IF NOT EXISTS` ile, kolonlar `ADD COLUMN IF NOT EXISTS` ile, FK'ler `pg_constraint` korumasıyla, policy DROP→CREATE ile ekleniyor. `DISABLE RLS` ve GRANT tekrar koşulabilir. İkinci koşuda değişecek bir ifade bulamadım. be-fb'nin iki kez uygulama ve `migrate diff` boş çıktısı da bununla tutarlı.
- **Down:** `migration-down-guard` ve `ON_ERROR_STOP` diğer down dosyalarıyla aynı kalıpta. Silme sırası doğru: önce QuotaUsage policy'si ve tablolar, sonra Cordis kolonları, en son enum'lar (enum'lar tablolardan sonra düşüyor). Her ifadede `IF EXISTS` var. CORDIS'te yalnız 3 yeni kolona dokunuluyor.
- **RLS:** Bu dalda `rls-coverage` yeşil. Dev+cherry-pick kopyasında `rls:check` şunu verdi: CHECK 4b, 17 tablo ✅; CHECK 4c, 8 politikasız tablo (5 yeni tablo dahil) DISABLE ✅.
- **CordisOrganization:** `BOOLEAN NOT NULL DEFAULT false` ve iki nullable kolon ekleniyor. PG11+'da bu yalnız metadata değişikliği; satır yeniden yazılmıyor. be-fb'nin dev klonundaki count+md5 öncesi/sonrası kanıtı aynı. Prisma tarafında Cordis yazan mevcut kodu kıracak zorunlu bir alan yok.
- **match-pic eşit aday:** `tied` bayrağı yalnız en iyi skorda eşitlik olunca kalkıyor, daha iyi bir aday gelince sıfırlanıyor. Aynı `organisationId`'nin iki satırı eşitlik sayılmıyor. Mantık doğru, ama bkz. Ö-1.

## Bulgular

### D1 — (Orta · bloke etmez, K2'den önce düzelt) Bulanık eşleme farklı kurumları birleştiriyor; portalın verdiği PIC de bulanık sonuçla eziliyor
`src/modules/m1/server/partner-search/match-pic.ts:84-107`
- **Kanıt** (geçici prob, aynı ülkede tek aday):
```
0.906 fuzzy | UNIVERSITA DEGLI STUDI DI PAVIA <-> UNIVERSITA DEGLI STUDI DI PADOVA
0.935 fuzzy | UNIVERSITA DEGLI STUDI DI PARMA <-> UNIVERSITA DEGLI STUDI DI PAVIA
0.850 unmatched | UNIVERSITY OF SURREY <-> UNIVERSITY OF SUSSEX
0.833 unmatched | HOCHSCHULE MUNCHEN <-> HOCHSCHULE MUNSTER
0.793 unmatched | ISTANBUL TEKNIK UNIVERSITESI <-> ISTANBUL TICARET UNIVERSITESI
```
- **Senaryo:** Uzun ve ortak önekli adlarda, Levenshtein oranı tek kelimelik bir farkı 0.9'un üstünde tutuyor. Doğru kurum CORDIS'te varsa 1.0 alıp kazanır. Yoksa ilan sessizce **başka bir üniversitenin PIC'ine** bağlanır ve M1 profili ile M8 eşleşmesi yanlış kuruma gider. Daha olası bir yol da var: portal ilanı `pic=123…` ile geliyor, bu PIC CORDIS'te yok (AB fonunda yeni bir kurum). Kod bu durumda bulanık eşlemeye düşüp başka bir PIC döndürüyor; test `falls back to fuzzy when the PIC is unknown` bunu bilerek sabitliyor. Portalın PIC'i tüzel kişinin kesin kimliğidir; farklı bir PIC'e "eşleşti" demek veri bozulmasıdır.
- **Önerilen düzeltme:** (a) Girdide geçerli bir PIC varsa ve CORDIS'te yoksa `unmatched` dön (`matchKey pic:<PIC>`). En iyi bulanık aday istenirse yalnız *öneri* olarak `UnmatchedOrganization`'a yazılsın, `organizationPic`'e yazılmasın. (b) Bulanık eşleşmede birinci ile ikinci aday arasında bir fark payı iste (ör. ≥0.05). Ad tokenları farklıysa (son token şehir) eşleşmeyi reddet, ya da eşiği yalnız ad uzunluğuna göre değil token düzeyinde uygula. Pavia↔Padova için bir negatif test ekle. Eşiğin kendisi (0.9) kartın istediği değer; değişmesi gereken eşik değil, kural.

### D2 — (Bilgi · dev'e taşıma talimatı) Tek commit'lik cherry-pick 4 dosyada çakışıyor; hepsi mekanik
`git merge-tree --write-tree --merge-base 0a654b99^ origin/dev 0a654b99`, exit=1. Kartın önerdiği `git merge-tree --write-tree origin/dev 0a654b99` komutu dalın tüm geçmişini (blog, interreg) birleştirdiği için 14 dosyada çakışma gösteriyor; bu, cherry-pick için yanıltıcı bir ölçüm.
1. `prisma/rls.sql`: **dev'in listesini al ve sona yalnız `'PartnerSearchQuotaUsage'` ekle.** Dalın satırını almak, dev'de `drop-evidence-reminder.sql` ile silinmiş olan `'EvidenceReminder'`'ı geri getirir. Bu ilk döngüde `to_regclass` koruması yok, bu yüzden `pnpm db:rls` "relation does not exist" hatasıyla kırılır. **En riskli çakışma budur.**
2. `prisma/migrations/apply-order.txt`: `add-partner-search.sql` satırını `blog-read-minutes.sql`'den sonraya koy.
3. `tests/rls-coverage.test.ts`: iki listenin birleşimini kullan (`ExpertPreRegistration` + 5 yeni tablo).
4. `docs/DATA_MODEL.md`: dev'de §22 ve §23 dolu; bölümü **§24** olarak numaralandır.
Bu çözümle, origin/dev tabanlı kopyada:
```
prisma validate (birleşmiş şema) → valid
vitest match-pic + rls-coverage → Test Files 2 passed, Tests 52 passed
rls:check → 48 model ✅ · CHECK 4b 17 ✅ · CHECK 4c 8 (BlogPost, ExpertPreRegistration, 5 PS tablosu, PublicLead) ✅
```
`schema.prisma` ve `scripts/rls-models.ts` otomatik birleşti. `normalizeOrgName` ve `Topic.identifier @unique` dev'de de mevcut.

### Öneriler (kusur değil)
- **Ö-1:** Eşitlik kontrolü tam float eşitliğine bakıyor; 0.935 ile 0.934 "eşit değil" sayılıp kabul ediliyor. D1(b)'deki fark payı bunu da kapsar.
- **Ö-2 (performans, K2 için):** `matchPic`, aynı ülkedeki her aday için O(L²) Levenshtein hesaplıyor. DE/FR'de on binlerce CORDIS kurumu ve binlerce ilan saatler sürebilir. K2'de önce PIC sorgusu yapılsın, sonra bir ön filtre (ilk token / trigram) uygulansın.
- **Ö-3:** Adı yalnız hukuki ekten oluşan bir kayıt (ör. "GmbH") boş ada normalize oluyor. Bu kayıtların hepsi aynı `name:<ÜLKE>:` matchKey'inde çakışır. Boş adda `unmatched` dönüp anahtarı ham ada bağlamak yeterli.
- **Ö-4:** `m1Manifest.tables` yeni tabloları listelemiyor (CLAUDE.md kural 2). Kart kapsamı dışında bırakılmış; K2'de eklensin.
- **Ö-5:** Down SQL'den sonra rls.sql geri alınmazsa `db:rls` kırılır, çünkü ilk döngüde koruma yok. Down dosyasının yorumu bunu söylüyor ve diğer tablolarla aynı kalıp; bilgi olarak not edildi.

## Kanıt (ham çıktı)
```
$ pnpm exec vitest run src/modules/m1/server/partner-search tests/rls-coverage.test.ts   (dal)
 Test Files  2 passed (2)
      Tests  56 passed (56)
$ pnpm exec prisma validate → The schema at prisma/schema.prisma is valid 🚀
$ git status --short (inceleme sonrası) → (boş)
```
Kendim koşamadıklarım: migration'ın DB'de up/down/up koşusu ve `rls:verify`. `.env` okuma izni reddedildiği için DB bağlantısı alamadım. Bunlar için be-fb raporundaki ham çıktıya dayandım: iki kez uygulama, `migrate diff` boş, down iki kez, CORDIS md5 aynı, fabrika_app probu.

## Değişen dosyalar
Yok. İnceleme salt okunurdu; geçici prob dosyası ve scratch worktree silindi.

## Riskler
- D2/1 yanlış çözülürse `db:rls` kırılır.
- D1 düzeltilmeden K2 canlıya çıkarsa yanlış PIC bağlantıları birikir. Bunları sonradan ayıklamak zor: UI'da ilan, başka bir kurumun profili altında görünür.

## Açık sorular
Yok. D1'in (a) seçeneği bir davranış kararı (portal PIC'i kesin kabul edilir); önerim (a)+(b). be-fb veya lider farklı düşünürse kartta yazsın.

## Sonraki adım
1. be-fb: D1'i (a)+(b) olarak düzeltsin ve Pavia↔Padova negatif testini eklesin. Küçük bir commit; yeniden incelemem gerekmez, testin geçmesi yeter.
2. Dev tabanlı dala taşıyan kişi D2'deki 4 çözümü uygulasın, ardından `pnpm rls:check` ve `pnpm db:rls` çalıştırsın.

**Platform:** mac (Darwin 27). SQL ve saf TS platformdan bağımsız; Windows ve Linux bu makinede olmadığı için koşulmadı.
