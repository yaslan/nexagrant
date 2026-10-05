---
name: fabrika-public-figure-audit-procedure
description: Herkese açık bir sayfadaki rakam denetiminde "bağla ya da çıkar" pratikte HEP "çıkar"dır — Evidence kiracıya özel+RLS, public sayfanın tenant'ı yok; önce DB'de ölç, çünkü rakam kaynaksız değil ÇELİŞİK çıkabilir
metadata:
  type: project
  updatedAt: 2026-09-08
---

CLAUDE.md kural 7 "her istatistik `Evidence` ya da `TopicStat` kaydına bağlı olacak" der.
Public pazarlama yüzeyinde bu seçenek **yapısal olarak yok**:

- `Evidence` kiracıya özel + RLS arkasında; landing/blog/pricing'in okuyacağı bir tenant yok.
- `TopicStat` paylaşımlı ve public okunabilir, **ama** yalnız topic bazlı başarı oranı tutar —
  "X kazanma şansını %40 artırır", "ortalama 4.8/5.0 hakem puanı" gibi iddiaların hiçbirini
  taşımaz.

Yani public bir rakam için karar ağacı tek dala iner: **çıkar.** ("yaklaşık" diye yumuşatmak
kabul değil.) Rakam ancak onu **ölçen sorguyla birlikte** geri gelebilir — ve o sorgu RLS'li
bir tabloya gidiyorsa [[fabrika-public-count-over-rls-table]].

**Yine de önce ÖLÇ — kaynaksız ile çelişik ayrı şeylerdir.** TASK-MTS6MRKDP168Q'da dört
iddiadan ikisi yalnız kaynaksız değildi, ölçümle **ters** çıktı:

| Sayfada yazan | Ölçüm |
|---|---|
| "150.000+ **Kayıtlı** CORDIS Kurumu" | `cordisOrganization.count()` = **0** |
| "€60B+ **İncelenen** AB Proje Bütçesi" | 20 projenin `ecMaxContribution` toplamı = **€0** |

Ölçüm raporu bambaşka bir cümle yazdırır ("çelişik" ≠ "belgesiz") ve düzeltmenin neden
yumuşatma değil silme olduğunu tek başına kanıtlar. Prisma 7'de tek seferlik sayım scripti
için `@prisma/client`'ı doğrudan `new PrismaClient()` ile kurma (driver adapter ister) —
repo'nun kendi `@/lib/db` export'unu kullan, `npx tsx --tsconfig tsconfig.json ./script.ts`.

**Metin denetiminde asıl aranacak şey rakam değil, iddia sınıfıdır.** Kart dört rakam saymıştı;
aynı dosyalarda aynı sınıftan üç tane daha vardı ("%25 ... etki puanını yükseltir", "50+ teklif
sıfır çakışmayla", "haftalardan saatlere"). Kelime olarak yazılmış oran da orandır.

**Ve `[0-9]` taraması bunu KAÇIRIR.** Commit'ten sonraki son kontrolde landing CTA'sında
"teklif hazırlama sürenizi **haftalardan günlere** indirin" / "from months to days" çıktı —
blog'dan çıkardığımın aynısı, tek farkı rakam içermemesi. İki tarama birden koş:

```bash
grep -nE "[0-9][0-9.,]*\s*(kat|milyar|milyon|bin|/5)|%[0-9]"              # rakamlı
grep -nE "haftalardan|aylardan|from (months|weeks) to|kat daha|misli"     # kelimeli
```

Kapan testine de iki formu birden koy, yoksa bir dahaki "aylardan günlere" yeşil geçer.

**En ağırı sayı değil, sayının kime yapıştırıldığıdır.** Landing'deki M1 örnek paneli
`Fraunhofer-Gesellschaft / PIC: 999984059` altına `342 Proje`, `€940M+`, `CENTRALITY: 0.9412`
ve "hakem puanını ortalama +1.8 puan yükseltir" yazıyordu — yani **gerçek bir üçüncü kurum
hakkında** uydurma olgu. Mock'a izin var, gerçek kuruma yapıştırılmış uydurma istatistiğe yok:
paneli `ÖRNEK GÖRÜNÜM` rozeti + anonim kurum + değer yerine `—` ile bıraktım. Bu bulgu
grep'ten değil **ekran görüntüsüne bakmaktan** çıktı — kareyi çekip gerçekten aç.

İlgili: [[fabrika-fabricated-fallback-antipattern]] · [[fabrika-source-guard-tests-must-strip-comments]] ·
[[fabrika-next-intl-ships-every-message-to-public-html]]
