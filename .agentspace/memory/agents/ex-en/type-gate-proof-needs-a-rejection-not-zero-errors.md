---
name: type-gate-proof-needs-a-rejection-not-zero-errors
description: "Tip güvenliği kartlarında 'typecheck 0 hata' kanıt değildir — kanıt, geçmemesi gereken kodun REDDEDİLDİĞİNİ göstermektir"
metadata:
  type: feedback
updatedAt: 2026-09-08
---

Bir tip katmanının/bayrağın işe yaradığını doğrularken **"0 hata" hiçbir şey kanıtlamaz**:
tip sistemi tamamen gevşekken de 0 hata görürsün. Nitekim Fabrika'da
`src/types/prisma-override.d.ts` tam olarak bunu üretiyordu — yeşil kapı, hayalet
sütunlara açılan bir kapı.

Kanıt, **yanlışlayıcı prob**tur: geçmemesi gereken kodu yaz, derle, reddedildiğini
çıktıyla göster. TASK-MTSJHTJZSCILI'de 7 prob (hayalet model; `where`/`select`/`data`
hayalet sütunu; yanlış skaler tip; hem `prisma` hem `TenantTx` üzerinden) — 7/7 reddedildi.
Sonra eski override'ı geri koyup aynı probu koştum: hayalet **model** yakalanıyor ama
hayalet **sütun** hatasız derleniyor. Kartın "override ne saklıyordu" sorusunun cevabı,
ancak bu RED koşusuyla ölçülebildi.

Aynısı eklediğim nöbetçi için de geçerli: yeni test **yeşil geçtiği için değil**, override
geri konunca **kırmızıya döndüğü için** güvenilir. Bir nöbetçiye GREEN kanıtı yazıyorsan
yanına RED kanıtını da koy; ayrıca nöbetçinin kendi "sahte geçme" yolunu kapat (probum,
aynı delegate üzerindeki **geçerli** sorgunun derlendiğini de assert ediyor — yoksa import
hiç çözülmese bile ilk iki assert geçerdi).

**Why:** Bu ofiste kartlar "gate yeşil" diye kapanıyor; tip güvenliği kartlarında bu ölçü
yanlış soruyu cevaplıyor ve kör noktayı kapanmış gösteriyor.

**How to apply:** Bir tip/şema/lint korumasını doğruladığım her kartta: (1) korumanın
reddetmesi GEREKEN minimal kodu yaz, (2) derleyip ret çıktısını rapora kopyala,
(3) korumayı geçici kaldırıp aynı kodun GEÇTİĞİNİ göster, (4) probu sil ve ağacın temiz
olduğunu doğrula. İlgili: [[fabrika-cross-verification-needs-a-falsifying-probe]],
[[fabrika-board-cards-go-stale]]
