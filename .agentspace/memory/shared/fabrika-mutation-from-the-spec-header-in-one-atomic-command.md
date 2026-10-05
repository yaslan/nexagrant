---
name: fabrika-mutation-from-the-spec-header-in-one-atomic-command
description: Mutasyon doğrulamasında hangi kusuru geri getireceğini SPEC'İN KENDİ başlık yorumu söyler; paylaşılan ağaçta yedekle-boz-koş-geri-al'ı TEK Bash komutunda yap, pencereyi saniyeye indir
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

Bayat bir "e2e kırmızı" kartını kapatırken testlerin yeşil olduğunu göstermek **yarım
ölçümdür** — yeşil, spec'in bir şey koruduğunu kanıtlamaz. Mutasyon şart. İki pratik sorun var
ve ikisinin de kısa cevabı var.

**1) Hangi mutasyonu seçeceksin? Spec'in başlık yorumu zaten yazıyor.**
Bu depoda spec'ler koruduğu kusuru üstlerinde anlatıyor. Mutasyonu icat etme, oradan al:

| Spec yorumu diyor ki | Mutasyon |
|---|---|
| "a thrown action went to `console.error`" | `catch`'teki `setError(...)`'ı yorumla |
| "an action that came back with no brief hit an `if` with no `else`" | boş-sonuç dalındaki `setError(...)`'ı yorumla |
| "an archive that silently deleted would pass a 'card is gone' check just as well" | `updateMany({deletedAt})` → `deleteMany` |

Sonuncusu en öğreticiydi (TASK-MTS6MBA7NEIM0): sert silme mutasyonunda "kart panodan kalktı"
adımı **geçiyor**, spec yine de kaydı geri okuduğu adımda yakalıyor. Mutasyonu spec'in en zayıf
görünen iddiasına değil, **yorumun adlandırdığı kusura** kur.

**2) Paylaşılan ağaçta ürünü bozmak.** `pnpm dev` ayakta ve başka pane'ler aynı ekranı ölçüyor
olabilir ([[fabrika-agents-share-one-working-tree]]). Yedek-boz-koş-geri-al'ı **tek** komutta yap,
böylece dosya saniyeler boyunca bozuk kalır ve komut yarıda kesilse bile yedek diskte durur:

```bash
cp "$SRC" "$BAK"
python3 - <<'PY'
... assert s.count(old)==1 ...        # tek eşleşme yoksa PATLA, yanlış yeri bozma
PY
npx playwright test <spec> -g "<tek test>" 2>&1 | grep -E "failed|Error:|Expected|> *[0-9]+ \|"
cp "$BAK" "$SRC"
git diff --stat "$SRC"                # BOŞ olmalı — geri alındığının ölçümü
```

Raporda mutasyon pencerelerini **ADIYLA bildir**: aynı dakikalarda o ekranı ölçen pane, gördüğü
anomalinin senin pencerene denk gelip gelmediğini ancak böyle anlar.

Bitince: fixture'ların geri alındığını SQL ile say (sert-silme mutasyonu kalıntı bırakabilir) ve
commit'li kanıt klasörünün kirlenmediğini `git status --porcelain docs/agent-results/...` ile
doğrula.

İlgili: [[fabrika-mutation-red-may-fire-on-another-assertion]] (kırmızıyı okurken HANGİ iddianın
ateşlendiğini yaz), [[fabrika-ab-baseline-without-git-stash]]
