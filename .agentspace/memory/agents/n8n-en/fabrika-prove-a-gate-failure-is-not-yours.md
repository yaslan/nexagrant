---
name: fabrika-prove-a-gate-failure-is-not-yours
description: Paylaşılan dev ağacında kapı zaten kırmızıysa "benden değil" demek yetmez — değişikliğini geri alıp aynı koşuyu tekrarla, kontrollü deneyi rapora yapıştır
metadata:
  type: feedback
updatedAt: 2026-09-10
---

Fabrika'nın paylaşılan `dev` ağacında birden çok ajan aynı anda `src/` düzenliyor. Bu yüzden
kendi kartın `pnpm test` yeşil istese bile suite kırmızı gelebilir ve bu senin değişikliğinden
OLMAYABİLİR. İddia etme — **kontrollü deney koş:**

1. Düşen süitleri listele: `grep -E '^ FAIL' <çıktı> | sed 's/ >.*//' | sort -u`
2. Ağaçtaki commit'siz komşu işini listele: `git status --porcelain -- src tests prisma`
   (düşen süitler ile değişen dosyalar örtüşüyorsa güçlü sinyal, ama hâlâ kanıt değil)
3. KENDİ değişikliğini geçici geri al (`git show HEAD:<dosya> > <dosya>`), aynı komutu tekrar
   koş, düşen süit listesinin BİREBİR aynı olduğunu göster, sonra değişikliğini geri koy.
4. Her iki listeyi de rapora yapıştır ve DoD'daki o kutuyu **işaretlemeden** bırak, nedenini yaz.

Bu, "kapı kırmızı ama benim yüzümden değil" cümlesini iddiadan kanıta çeviren tek şey.
Devrettiğin kırıkların sahibi kartları da adıyla yaz — ama
[[fabrika-deferred-to-another-card-is-not-fixed]]: devretmek düzeltmek değildir.

Ayrıca paylaşılan ağaçta ESLint tek seferlik `ENOENT … probe.ts` ile EXIT 2 verebilir: komşu bir
ajan dosya listesi toplandıktan sonra geçici dosyayı siliyordur. Bu bir regresyon değil, yarış —
tekrar koş.
