---
name: fabrika-db-backed-change-needs-a-db-baseline-too
description: Değişikliğin veritabanında yaşıyorsa (migration/RLS politikası) A/B baseline'ı için dosyaları geri almak YETMEZ — down migration'ı da koş, yoksa "bende değil" ölçümü sahte
metadata:
  type: feedback
  updatedAt: 2026-09-09
---

[[fabrika-ab-baseline-without-git-stash]] dosya takasını anlatıyor ve kod değişiklikleri için
doğru. Ama değişikliğin **etkisi veritabanındaysa** (migration, `prisma/rls.sql` politikası,
seed) dosyayı geri almak baseline üretmez: Postgres hâlâ yeni hâlde durur, testler yeni şemayla
koşar, "değişiklik öncesi" dediğin ölçüm aslında karma bir durumdur.

Tam prova (TASK-MTU6HUB8FUHMG'de 12 e2e kırmızısını aklamak için koşuldu):

```bash
# 1. VERİTABANINI geri al — ters sırada (politika kolonu kullanıyor)
npx tsx <apply> prisma/migrations/<X>.down.sql prisma/migrations/<Y>.down.sql
# 2. DOSYALARI geri al — yalnız kendi yollarını ver, çıplak `git stash` ASLA
git stash push -- <yalnız kendi dosyaların>
mv <kendi yeni/untracked dosyaların> <scratchpad>/hold/
# 3. İstemciyi yeniden üret, yoksa tipler yeni şemayı hatırlar
pnpm db:generate
# 4. ÖLÇ
pnpm exec playwright test <ilgili spec'ler>
# 5. Her şeyi geri kur ve YENİDEN doğrula
git stash pop && mv <scratchpad>/hold/* <yerlerine>
npx tsx <apply> prisma/migrations/<X>.sql prisma/migrations/<Y>.sql
pnpm db:generate && pnpm db:rls && pnpm rls:verify
```

`git stash push -- <yollar>` yol-kapsamlı olduğu için paylaşılan ağaçta güvenli — başka
ajanın dosyasına dokunmaz. Çıplak `git stash` hâlâ yasak.

**Bedava yan fayda:** bu prova aynı zamanda **geri alma yolunun gerçekten çalıştığının kanıtı**.
Raporun "Geri alma" bölümüne "yazıldı" değil "koşuldu" yazabilirsin — DevOps DoD'u tam da bunu
istiyor ve başka türlü kanıtlanmıyor.

**Dikkat — alt küme koşumu farklı kırmızı verir:** `pnpm test:e2e` tamamı 12 kırmızı verirken
aynı 8 dosyanın alt küme koşumu 7 verdi ve setler birebir aynı değildi (`fabricated-fallbacks`
tam koşumda `:105`, alt kümede `:86`/`:125`). Bu spec'ler ortak seed kiracıları üzerinden
birbirini kirletiyor. Yani baseline'ı **aynı komutla** al, ve set farkını raporda açıkla;
yoksa "5 test benim yüzümden" gibi yanlış bir sonuç çıkarırsın.

İlgili: [[fabrika-ab-baseline-without-git-stash]] · [[fabrika-gate-includes-e2e-and-pre-push-runs-it]]
