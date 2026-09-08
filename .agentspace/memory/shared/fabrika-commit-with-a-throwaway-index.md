---
name: fabrika-commit-with-a-throwaway-index
description: Başka ajanın stage'lediği dosyalar dururken kendi işini commit etmenin temiz yolu — GIT_INDEX_FILE ile geçici index; sonra gerçek index'i HEAD'e senkronla yoksa commit'in geri alınabilir
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

Paylaşılan çalışma ağacında commit anında **gerçek index başka ajanın dosyalarıyla dolu**
olabilir ([[fabrika-staged-work-gets-swallowed]]). `git commit -- <yollar>` pathspec'i
index'i yok sayar ama **index'i temizlemez**; `git add` ise onların işini alır.

**En temiz yol — kendi index'ini bir kenarda kur:**
```bash
export GIT_INDEX_FILE=/tmp/scratch/my-index
rm -f "$GIT_INDEX_FILE"
git read-tree HEAD                       # boş sayfa: HEAD
git add <yalnız kendi yolların>
git rm --cached -q <sildiğin dosya>      # silme varsa
git commit -F mesaj.txt                  # gerçek .git/index'e HİÇ dokunulmaz
unset GIT_INDEX_FILE
```
Başka ajanın stage'lediği her şey aynen yerinde kalır; commit'ine hiçbiri girmez.
pre-commit hook normal çalışır (staged kapsam = senin yolların).

**ZORUNLU son adım — yoksa commit'in geri alınır.** Commit sonrası gerçek `.git/index`
o yollar için HÂLÂ eski içeriği taşır, yani HEAD'e göre "senin değişikliğini geri alan"
bir stage gibi görünür. Bir sonraki ajan pathspec'siz `git commit` çalıştırırsa işini
**geri alır**. Bu yüzden hemen:
```bash
git reset -q HEAD -- <aynı yollar>       # working tree'ye dokunmaz, index'i HEAD'e eşitler
git status --porcelain -- <yollar>       # boş çıkmalı
```

**Belirtinin nasıl göründüğü (2026-09-08 / TASK-MTSJJOR63M63R).** `update-ref` sonrası
`git status --short` **yeni commit'lediğin dosyaları `D ` (staged deletion) olarak**
listeler — "silinmiş" gibi görünürler ama diskte dururlar (aynı yollar ayrıca `??` olarak
da çıkar). 8 dosyalık commit'imin 8'i birden böyle göründü. O anda başka bir ajan
pathspec'siz `git commit` atsaydı **dosyalarımı silinmiş olarak** commit'lerdi. `D ` +
`??` çiftini gördüğün an bu odur; panikleyip `git checkout` ile dosyaları geri koymaya
çalışma — dosyalar zaten yerinde, **bayat olan index**. Çözüm aşağıdaki `git reset -q
HEAD -- <yollar>`, yalnız kendi yollarınla (pathspec'siz `git reset` başka ajanın
stage'ini siler).

2026-09-08 / TASK-MTS6LZOD715WM: commit anında index'te başka bir ajanın 13 dosyası
(`src/app/not-found.tsx`, `UserMenu.tsx`, `briefs/client.tsx`, kendi hafıza + rapor
dosyaları) duruyordu; bu yöntemle 11 dosyalık kendi commit'im (`22b5406`) hiçbirini almadı.
Aynı koşuda ters yönü de yaşandı: `messages/*.json`'a eklediğim i18n anahtarları, ben
commit etmeden başka bir ajanın geniş `git add`'iyle `266f00b`'ye girdi
(`git log -S"<anahtar>" -- <dosya>` ile bulunur).

**2026-09-08 / TASK-MTREW28BU7STD — tek dosyalık "basit" commit'te bile oldu.** Sadece
kendi rapor dosyamı `git add <yol>` ile ekleyip düz `git commit` çalıştırdım — "tek
dosya, throwaway index'e gerek yok" diye düşündüm. Commit `b3b4260`'a başka bir ajanın
(`ex-en`, TASK-MTPZF8X1W8WCU) o anda stage'li duran 2 dosyası (`...-ex-en-2.md` + bir
screenshot) da girdi. Zarar yoktu (onların işi de commit'e girip güvenle tarihçeye geçti,
kaybolmadı) ama attribution kirlendi. **Ders: "tek dosya ekliyorum" commit boyutuyla
ilgili değil — index PAYLAŞILDIĞI için risk her zaman var; boyut fark etmez, her commit'ten
önce throwaway index kullan ya da en azından `git status --short` ile commit ÖNCESİ
index'i gözden geçir.**

İlgili: [[fabrika-agents-share-one-working-tree]] · [[fabrika-stage-one-hunk-of-a-shared-file]] ·
[[fabrika-concurrent-commit-steals-your-stage]]
