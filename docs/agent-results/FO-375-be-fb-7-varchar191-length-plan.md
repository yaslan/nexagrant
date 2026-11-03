# FO-375 rev.7 ek: 25 "sınır kanıtsız" VarChar(191) alanı — taşıma öncesi uzunluk ölçümü planı

**Durum:** YAZILDI, ÇALIŞTIRILMADI. Bu ek canlı veriye dokunmaz. Ölçüm, taşıma (Faz 2) öncesinde canlı PG'ye salt-okur bağlantıyla yapılacak; bağlantı dizesi ve parola bu dosyaya yazılmaz.

**Kaynak:** `docs/agent-results/FO-375-be-fb-6.md` içindeki 25 alanlık liste (r6, 46. satır). Liste karar dosyasındaki `prisma/mysql/string-decisions.json` kayıtlarıyla eşleştirildi.

## Neden gerekli
Bu 25 alan `VarChar(191)` olarak tutuldu, çünkü kodda üst uzunluk kanıtlanamadı. Taşımadan önce en uzun gerçek değer ölçülmezse, 191'i aşan bir satır MariaDB'de hataya ya da sessiz kırpmaya yol açar. Tablo dağılımı ve sayılar rev.7 TSV'de (`FO-375-be-fb-7-model-classification.tsv`).

## Alan listesi (r6 ile birebir)

| # | Model.alan | Tablo (MariaDB) | Not |
|---|---|---|---|
| 1 | AddOn.sku | AddOn | |
| 2 | BlogPost.slug | BlogPost | |
| 3 | Call.callIdentifier | Call | |
| 4 | Consent.documentVersion | Consent | |
| 5 | CordisOrganization.nameNormalized | CordisOrganization | platform görünümü (TEMPTABLE) |
| 6 | CordisProject.masterCall | CordisProject | platform görünümü |
| 7 | CordisProjectSciVoc.scivocCode | CordisProjectSciVoc | |
| 8 | CordisProjectTopic.topicCode | CordisProjectTopic | platform görünümü |
| 9 | CreditLedger.grantPeriod | CreditLedger | |
| 10 | ExpertPreRegistration.status | ExpertPreRegistration | |
| 11 | InterregRubricCriterion.criterionKey | InterregRubricCriterion | platform görünümü |
| 12 | Invoice.paymentRef | Invoice | |
| 13 | LifetimeLicence.providerEventId | LifetimeLicence | |
| 14 | LifetimeLicence.providerSessionId | LifetimeLicence | |
| 15 | Notification.dedupeKey | Notification | |
| 16 | PartnerSearchAnnouncement.externalId | PartnerSearchAnnouncement | platform görünümü |
| 17 | RawFetch.key | RawFetch | sistem tablosu |
| 18 | RawFetch.source | RawFetch | sistem tablosu |
| 19 | StripeEventLog.stripeEventId | StripeEventLog | |
| 20 | SystemAlert.source | SystemAlert | platform görünümü |
| 21 | Tenant.slug | Tenant | platform görünümü |
| 22 | Topic.identifier | Topic | platform görünümü |
| 23 | TopicStat.topicPrefix | TopicStat | sistem tablosu |
| 24 | UnmatchedOrganization.matchKey | UnmatchedOrganization | |
| 25 | Workspace.slug | Workspace | tenant görünümü |

Not: `Evidence.r2ObjectKey` bu listede değil. Rev.7'de karar dosyasında `OPEN` oldu (VarChar(191) varsayılanı korunur, uzunluk kanıtlanamadı). Faz 2 girdisi olarak raporda ayrıca yer alır.

## Salt-okur ölçüm şablonu (ÇALIŞTIRILMADI)
Her alan için tek sorgu. Tablo ve kolon adları Prisma'nın üretilen tablo/kolon adlarıyla aynıdır (PG tarafında tırnaklı). Yalnız `SELECT` içerir; yazma, DDL ve `SET` yoktur.

```sql
-- PG salt-okur (ör. read-only rol / replica). Kolon ve tablo adlarını satır satır değiştir.
SELECT
  '<Model>.<alan>' AS field,
  COUNT(*)                          AS rows_total,
  MAX(char_length("<alan>"))        AS max_chars,
  MAX(octet_length("<alan>"))       AS max_bytes,
  COUNT(*) FILTER (WHERE char_length("<alan>") > 191) AS over_191
FROM "<Model>";
```

Karar kuralı:
- `max_chars <= 191` ve `over_191 = 0`: alan `VarChar(191)` olarak kalır, kanıt kaydı `DECIDED` olur (ölçüm tarihi ve kayıt sayısıyla).
- `max_chars > 191`: alan `LongText` ya da `VarChar(n)` (n = max * 2, üst sınır) olarak yeniden karara bağlanır; UNIQUE/index içindeyse `LongText` yasak, hash + yol kolonu önerisi Faz 2'ye gider.
- `rows_total = 0`: ölçüm kanıtı yetersiz; şema kararı değişmez, ayrıca not düşülür.

## Yetki ve güvenlik
- Ölçüm yalnız salt-okur rolle yapılır; bağlantı dizesi konsola ya da dosyaya yazılmaz (ortam değişkeni).
- Ölçüm tek bir `SELECT` her alan için, tablo başına tek tarama; uzun süren tarama için replika tercih edilir.
- Sonuçlar kişisel veri içermez (yalnız uzunluk ve sayı). Değer örneği çekilmez.

## Sahiplik
Ölçüm: be-fb, Faz 2 başında. Sonuç: bu dosyanın altına ek bölüm olarak eklenir ve karar dosyasında ilgili kayıt güncellenir.
