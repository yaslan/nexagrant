---
name: fabrika-recall-before-delegating-not-after
description: Hafızayı dalgayı dağıttıktan SONRA aradım ve paylaşılan katalog tuzağını kaçırdım — arama, alt-görev metinlerini YAZMADAN önce yapılmalı
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

## Ne oldu
7 kişilik paralel dalgayı dağıttım; iki worker'a (`pipeline.*` ve `invoice.*`)
`messages/{tr,en}.json` üzerinde ad-alanı bölerek çalışma talimatı verdim ve
commit kuralı olarak "`git add -A` YOK, dosyaları adıyla ekle" yazdım. Dağıtımdan
SONRA iş-sonu ritüeli için hafızayı aradığımda
[[fabrika-shared-json-whole-file-add-swallows-others-edits]] çıktı: `git add <tek dosya>`
o dosyanın O ANDAKİ TÜM içeriğini stage'ler, yani benim yazdığım kural tam da
bilinen tuzağın kendisiydi. Ad alanı ayırmak İÇERİK çakışmasını engelliyor,
STAGE yutmasını engellemiyor.

## Neden önemli
Alt-görev metni worker'a VERBATIM gidiyor. Metin yazılırken eksik olan kural,
dalga koştuktan sonra ancak yamayla düzelir — ve yama her zaman yetişmeyebilir.
Hafıza aramasının değeri "ne öğrendim" anında değil, "talimatı yazarken" anında.

## Nasıl uygulanır
Dağıtım sırasına bir adım ekle: **kartları açmadan/alt-görev metnini yazmadan önce**
işin dokunacağı PAYLAŞILAN dosyalar için hafızayı ara (`messages/*.json`, `prisma/schema`,
`docs/ROADMAP.md`, kapı betikleri gibi çok-yazarlı yollar). Sorgu, dosya adının kendisi olsun.

## Bu turda nasıl kurtarıldı
[[fabrika-sendmessage-to-workers-is-not-a-reliable-relay]] — dalga koşarken 7 pane'e
düzeltici kuralı SendMessage ile gönderdim. Yama tuttu ama bedava değildi: 7 worker'ın
her biri bir tur harcadı.

İlgili: [[fabrika-file-ownership-delegation-works]] · [[fabrika-shared-worktree-commits-are-not-atomic]]
