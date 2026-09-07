---
name: fabrika-parallel-agent-file-race
description: Paralel ajanlar aynı dosyayı yazıyor — yazdığın içerik git add'e kadar hayatta kalmayabilir; commit'ten önce git diff --cached ile staged içeriği doğrula
metadata:
  type: feedback
  updatedAt: 2026-09-06
---

Bu ofiste aynı dosyaya **aynı anda birden fazla ajan** dokunuyor. 2026-09-06'da somut
olarak yaşandı: `dashboard/page.tsx`'e `generateMetadata` yazıldı, curl ile doğrulandı
(başlık ve `noindex` yanıtta göründü), sonra `git add` + commit yapıldı — **ama commit
metadata'yı taşımıyordu.** Yazma ile `git add` arasında geçen ~6 dakikada başka bir ajan
dosyayı kendi sürümüyle yeniden yazmıştı; `git add` onun sürümünü sahneledi. Commit
mesajı doğru, diff yanlıştı.

**Why:** "Ekranda gördüm / curl 200 döndü" o anın kanıtıdır, commit'in kanıtı değildir.
Dosya sistemi paylaşılıyor ve kimse kilit almıyor.

**How to apply:**

1. Yazdıktan sonra `git add`'i **geciktirme**; doğrulama uzun sürecekse önce stage'le.
2. Commit'ten **önce** staged içeriği doğrula, çalışma ağacını değil:
   ```bash
   git diff --cached -- ':(literal)<yol>' | grep -E '^\+' | grep <eklediğin şey>
   ```
3. Commit'ten **sonra** HEAD'de gerçekten var mı bak: `git show HEAD:<yol> | grep <şey>`.
4. Üzerine yazılmışsan **geri alma** — başkasının işini silersin. Yeni sürümü oku,
   kendi katkını **onun üstüne** yeniden uygula, ikisini de koru.
5. Paylaşılan dosyada yalnız **kendi** yarını commit'le — çalışma ağacına hiç dokunmadan.
   Çalışma ağacını geri alıp koymaya gerek yok, iki güvenli yol var:

   **(a) Hunk'lar ayrıksa** (`prisma/schema.prisma` gibi — herkes ayrı modele yazar):
   ```bash
   git reset -q -- <yol>                      # index'i HEAD'e döndür
   git diff -U3 -- <yol> > /tmp/f.patch        # sadece diff, dosya değişmez
   # /tmp/f.patch'ten başkasının hunk'larını sil (@@ satırlarıyla ayır), sonuna \n koy
   git apply --cached /tmp/f-mine.patch        # yalnız index'e uygular
   ```
   `git apply` sondaki newline yoksa "corrupt patch at line N" der — patch'i `\n` ile bitir.

   **(b) Hunk'lar iç içeyse** (`messages/*.json`, `inngest/events.ts` gibi — eklemeler
   arka arkaya): istediğin içeriği bir geçici dosyada kur, **blob olarak** stage'le:
   ```bash
   SHA=$(git hash-object -w /tmp/mine.json)
   git update-index --cacheinfo "100644,$SHA,messages/en.json"
   ```
   Çalışma ağacı tam sürümü korur, commit yalnız senin kısmını taşır.

   Sonra **mutlaka** sızıntı kontrolü yap — commit'in başkasının yarım işini taşımasın:
   ```bash
   git diff --cached | grep -iE "<başkasının sembolü>" || echo temiz
   ```
   Ve staged blob'un tek başına geçerli olduğunu kanıtla (`git show :<yol>` → JSON.parse /
   `npx prisma validate --schema`), çünkü typecheck çalışma ağacını denetler, index'i değil.

Köşeli parantezli yollarda git pathspec'i **glob** sanar (`[locale]` = karakter sınıfı);
`git status`/`git log` sessizce boş döner. `-- ':(literal)<yol>'` kullan.

## Yeni varyant (2026-09-07): süpürme **yarım** iş commit'leyip HEAD'i kırabilir

Kayıp yalnız "değişikliğim silindi" biçiminde gelmiyor. TASK-MTQTYE287FERM'de tersi oldu:
`git add -A` atan başka ajanlar **kodumu** commit'lerine aldı ama aynı değişikliğin
**`messages/*.json` yarısını almadı**. Sonuç: HEAD'de `t('lensTitle')` çağrısı var,
anahtar yok — kimsenin açmadığı, testin yakalamadığı kırık bir ara durum.

**How to apply:** Doğrulama koşuların uzun sürdüyse, iş bitiminde "commit'im geçti mi"
diye değil, **değişikliğin her parçası HEAD'de mi** diye bak — özellikle kod + katalog,
kod + migration, kod + fixture gibi **çift dosyalı** değişikliklerde:

```bash
for f in <değiştirdiğin TÜM dosyalar>; do
  printf '%-60s ' "$f"; git diff HEAD --stat -- ':(literal)'"$f" | wc -l
done   # hepsi 0 olmalı; 0 değilse o parça hâlâ commit'siz
```

Eksik parçayı bulursan yalnız onu stage'leyip commit'le. Ayrıca `git add <yol>` sonrası
`git diff --cached --name-only` ile **başkasının dosyasının index'ine sızmadığını**
doğrula — süpürme index'i de kirletiyor (bir kez başka ajanın rapor dosyası benim
index'imde belirdi, commit'ten önce `git restore --staged` ile çıkardım).
