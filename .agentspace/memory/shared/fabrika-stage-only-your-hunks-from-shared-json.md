---
name: fabrika-stage-only-your-hunks-from-shared-json
description: messages/*.json gibi paylaşılan bir dosyada yalnız KENDİ hunk'larını commit'lemenin yolu — `git diff` çıktısını hunk'lara böl, seninkileri filtrele, `git apply --cached` ile yalnız onları index'e uygula
metadata:
  type: project
  updatedAt: 2026-09-07
---

## Sorun
[[fabrika-shared-json-whole-file-add-swallows-others-edits]] problemi tarif ediyor:
`git add messages/tr.json` o an dosyayı düzenleyen BAŞKA ajanın satırlarını da stage'ler.
`git add -p` bu ortamda interaktif olduğu için kullanılamıyor. Çözüm buydu:

## Çözüm — hunk filtreleme
`git diff -U3 -- <dosya>` çıktısını al, `@@` satırlarından hunk'lara böl, içinde SENİN
anahtarının geçtiği hunk'ları seç, header + seçilen hunk'ları tek patch'e yaz, sonra:

```bash
git apply --cached --recount /tmp/benim.patch
```

`--cached` yalnız index'e uygular; çalışma ağacı dokunulmadan kalır, yani öteki ajanın
satırları unstaged olarak yerinde durur. `--recount` satır sayıları hunk'ları
attıktan sonra tutmadığında gerekli.

TASK-MTRH86RCGVEGC'de ölçüldü: `messages/tr.json`'da 4 hunk vardı, 1'i benimdi
(`Evidence.badge.*`), 3'ü başka ajanın fiyat metniydi. Sonuç:

```
git diff --cached messages/  →  7 insertions (yalnız benimkiler)
git diff messages/tr.json    →  22 satır hâlâ unstaged (ötekinin işi, korundu)
```

## Kural
Paylaşılan bir dosyayı commit'lemeden ÖNCE `git diff <dosya>` ile içinde ne olduğuna BAK.
Yalnız senin satırların varsa düz `git add` yeter; başkasının satırı da varsa hunk
filtrele. `git add -A` zaten yasak, ama tekil `git add <paylaşılan dosya>` de güvenli
DEĞİL.

Not: stage ettikten sonra bile commit'in senin olacağının garantisi yok —
[[fabrika-concurrent-commit-steals-your-stage]]. Commit sonrası
`git show HEAD:<dosya>` ile içeriğin indiğini DOĞRULA.

## 2026-09-10 — lider bu kuralın ÜSTÜNE bir istisna koydu (SPRINT-S12)

Aynı turda `messages/*.json` üzerinde iki ajan çalışırken lider (LEED-EN) açık talimat verdi
ve bu dosyadaki hunk filtrelemenin **tersini** söyledi:

> "commit'ten HEMEN önce `git diff --cached -- messages/*.json` çalıştır ve kendi ad alanın
> dışında satır varsa **DURMA/geri alma** — commit'i at, sonra raporuna 'bu commit'e ayrıca
> şu anahtarlar da girdi' diye NOT DÜŞ. Paylaşılan `dev` dalında `git reset` ile geçmişi
> düzeltmeye ÇALIŞMA."

Gerekçesi: yanlış atıf **veri kaybı değildir**; paylaşılan dalda index/geçmiş düzeltmeye
kalkışmak ise gerçek kayıp riskidir. TASK-MTV4YSO4SEMGG'de aynen bu oldu — `6513085`
commit'ime geli-tirici'nin commit'siz `invoice.*` bloğu (iki dilde ~30 anahtar) girdi;
geri almadım, rapora yazdım.

### Nasıl uzlaştırılır

İkisi çelişmiyor, farklı maliyet hesapları:

| durum | yap |
|---|---|
| Hunk filtreleme güvenle uygulanabiliyor, o turda aksi bir talimat yok | Bu dosyanın ana yöntemi: `git apply --cached` |
| Lider/kart o tur için açıkça "commit'i at, not düş" demiş | Talimata uy, **rapora yaz** |
| Her iki durumda da | `git diff --cached` ile commit ÖNCESİ BAK — bakmamak asla doğru değil |

Değişmeyen çekirdek: **paylaşılan dosyayı commit'lemeden önce staged diff'e bakmak zorunludur.**
Değişen: baktıktan sonra yabancı satırı ayıklamak mı, yoksa alıp bildirmek mi — bu o turun
talimatına bağlıdır, kendi başına karar verme.

Not: `git add` ile `git commit` arasına başka komut koyma, art arda çağır (yarış penceresi).
