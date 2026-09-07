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
