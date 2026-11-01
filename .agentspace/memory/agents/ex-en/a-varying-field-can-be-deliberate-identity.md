---
name: a-varying-field-can-be-deliberate-identity
description: Bir alanın koşudan koşuya değişmesi onu otomatik olarak gürültü yapmaz — katlamadan önce testlerde o ayrımı KASTEN koyan bir karar var mı diye bak; Fabrika'da purge alarmı böyle geri alındı
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

TASK-MTVRBLKRUUEUM'da kural netti: kimliğinde koşu-başına değişen alan taşıyan her
çağırana kararlı bir `dedupeKey` ver. `buildPurgeFailureAlert`
(`src/lib/inngest/jobs/users-scheduled-deletion.ts`) bu tarife **birebir** uyuyor
görünüyordu — meta'sında `failedCount` ve `failedUserIds` var, ikisi de her koşuda
değişiyor. Dönüştürdüm. Test kırıldı ve **haklıydı**:

```
tests/users-scheduled-deletion.test.ts:279
  // A different account failing is a different fact and must open its own row.
  expect(alertIdentity(wednesday)).not.toBe(alertIdentity(monday));
```

İki şeyi birden kaçırmışım:
1. O çağıran **zaten katlanıyordu**. `failedUserIds` sıralı yazılmıştı (kod yorumu
   bunu açıkça söylüyor: "the same two accounts failing in the other order is the same
   alert"), yani gerçek tekrar — aynı hesaplar iki gece üst üste — varsayılan kimlikle
   zaten tek satıra düşüyordu. Kırık bir çağıran değildi.
2. Değişkenliği **kasıtlıydı**. Hangi hesapların takıldığı, yazarın bilinçli kararıyla
   kimliğin parçasıydı ve bu karar bir testte yazılıydı.

Geri aldım. Kalan 21 çağıranı dönüştürdüm.

**Why:** "Bu alan değişiyor" gözlemi ile "bu alan gürültü" hükmü aynı şey değil.
Aradaki fark, alanın değişmesinin **problemi mi yoksa yalnız oluşumu mu** değiştirdiği —
ve bu bir mühendislik kararıdır, ölçüm değil. Fazla-katlama sessizdir: iki gerçek
problem tek satıra düşer ve kimse fark etmez, çünkü konsol *daha temiz* görünür.

**How to apply (bir kimliği daraltmadan / katlamadan önce):**

1. Önce **zaten katlanıyor mu** diye bak. Sıralanmış dizi, sabit meta, kapalı kümeden
   gelen değer → muhtemelen katlanıyor; dokunma. Ölç, varsayma.
2. Alanı kimliğe koyan yorumu ve **testini** ara: `grep -rn "<fonksiyon adı>" --include
   '*.test.ts'`. Kasıtlı bir ayrım genelde tam olarak orada, cümleyle yazılıdır.
3. "Bu alanı düşürürsem hangi iki ayrı olgu tek satıra düşer?" sorusunu **somut iki
   örnekle** cevapla. Cevap veremiyorsan anahtarı henüz savunamıyorsun.
4. Her katlama için bir **çürütme sondası** koştur: gerçekten farklı bir problem hâlâ
   AYRI satır açıyor mu? Bu, katlamanın fazla geniş olmadığının tek kanıtıdır.
5. Kiracı sınırına dikkat: kiracıyı ayırt etmeyen anahtar iki kiracının problemini
   birleştirir. Anahtarda kiracı kapsamlı bir kimlik (bağlantı id'si gibi) tutabiliyorsan
   tut; alarm zaten kiracı taşımıyorsa bunu **riskler bölümünde açıkça** yaz.

İlgili: [[fabrika-alert-dedupe-needs-stable-meta]] ·
[[fabrika-dedupe-candidate-limit-caps-the-fold]] ·
[[fabrika-verification-recipe-mutation-and-counterfactual]]
