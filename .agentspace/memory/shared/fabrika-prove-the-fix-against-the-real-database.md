---
name: fabrika-prove-the-fix-against-the-real-database
description: Kiracı izolasyonu düzeltmesini mock'la değil gerçek Postgres'e karşı kanıtla — eski kodu geçici geri alıp e2e'yi koşmak "kusur teorikti" tartışmasını tek çıktıyla bitirir
metadata:
  type: feedback
updatedAt: 2026-09-07
---

Bir güvenlik düzeltmesinin kanıtı "yeni test geçiyor" DEĞİLDİR — düzeltmeden ÖNCEKİ kodun aynı
testi düşürdüğüdür. Fabrika'da işe yarayan üçlü (TASK-MTQZMLLZE1I29):

1. **Birim test + RED kontrolü.** `git stash` gerekmez: düzeltilen satırları `perl -0pi -e` ile
   geçici geri al, testi koş, çıktıyı rapora YAPIŞTIR, `cp` yedekten geri koy. 40 saniye.
2. **Mock'u düzeltmeden GÜVENLİ hale getirme.** `tests/gates.test.ts`'te `findUnique` mock'u
   kiracı şartını bilerek yok sayar. Mock veritabanından güvenli olursa, eski koda dönen regresyon
   testte YAKALANMAZ — test kendi kendini kandırır.
3. **Gerçek DB e2e.** İki kiracılı seed (`scripts/seed-gate-e2e.ts` kalıbı: idempotent upsert +
   `--rollback`), A'nın tenantId'siyle B'nin id'sini çağır. Eski kod `{passed: true}` döndürdü —
   bu tek satır, kusurun teorik olmadığını her tartışmadan daha iyi kapatır.

**Vacuous-pass tuzağı:** "bulunamadı" cevabı, satır hiç yoksa da gelir. İzolasyon testinde çağrıdan
ÖNCE fixture'ın var olduğunu ve doğru kiracıya ait olduğunu assert et; yoksa fixture silindiğinde
test yeşil kalır ve hiçbir şey ölçmez.

İlgili: [[fabrika-tenant-filter-check-the-write-too]] · [[fabrika-blame-the-e2e-failure-with-a-stash]]
