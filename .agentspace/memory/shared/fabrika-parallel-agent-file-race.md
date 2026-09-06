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
5. Paylaşılan JSON'larda (`messages/tr.json` gibi) yalnız kendi hunk'ını stage'le:
   HEAD sürümünü al → anahtarını ekle → `git add` → çalışma ağacını geri koy.

Köşeli parantezli yollarda git pathspec'i **glob** sanar (`[locale]` = karakter sınıfı);
`git status`/`git log` sessizce boş döner. `-- ':(literal)<yol>'` kullan.
