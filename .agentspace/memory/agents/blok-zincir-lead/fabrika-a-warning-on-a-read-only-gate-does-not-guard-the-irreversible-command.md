---
name: fabrika-a-warning-on-a-read-only-gate-does-not-guard-the-irreversible-command
description: Ayrı bir salt-okunur kapının ⚠️ uyarısı, geri alınamaz komutu DURDURMAZ — muhafız eylemin kendi yolunda olmalı; ve muhafızı kanıtlarken kimlik bilgisini boşaltıp iki sonucu da güvenli hale getir
metadata:
  type: project
  updatedAt: 2026-09-08
---

`scripts/esr-calibration.ts`'te `--preflight` 2026-09-08'den beri "son tarih
2026-09-21, ortaklara 14 gün borçlusun, 13 gün kaldı" diye **uyarıyordu**.
Ama preflight **ayrı, salt-okunur bir komut**; `--send`'in üç muhafızı vardı
(sahte adres, tekrar gönderim, yerel makbuz) ve son tarih onlardan biri değildi.
Yani roster geldiği gün anket, **tutulamayacağı belli olan bir tarihi taşıyarak**
gidecekti — posta geri çağrılamaz.

**Ders (genellenebilir):** bir kapının UYARISI ile bir komutun MUHAFIZI aynı şey
değildir. Operatörün Pazartesi okuduğu satır, Salı günü postayı durdurmuyorsa
o satır yalnız bir dipnottur. Geri alınamaz her eylemde (`--send`, ödeme,
imha, migration) sor: **"bu ön kontrolü kim ATLAYABİLİR?"** Cevap "kullanıcı
başka bir komut çalıştırırsa" ise, muhafız yanlış yerdedir.

**İkinci ders — tek aritmetik, iki çağıran.** Uyarıyı ve reddi ayrı ayrı
hesaplarsan kapı "ulaşılamaz" derken `--send` postalayabilir. Yüklemi tek bir
yere koy (`deadlineWindow()`, `src/lib/beta/esr-readiness.ts`) ve **iki tarafın
aynı tarihlerde aynı cevabı verdiğini** test et (sürüklenme testi). CLAUDE.md #5'in
kredi formülü kuralıyla aynı aile.

**Üçüncü ders — geri alınamaz bir muhafızı GÜVENLE kanıtlama tekniği:**
kimlik bilgisini boşalt (`RESEND_API_KEY= pnpm tsx …`) ve iki sonucu ayırt et:
- muhafız ateşlerse → son tarih reddi (kanıt)
- ateşlemezse → "requires RESEND_API_KEY" (yine posta YOK)
Her iki dalda da zarar imkânsız, ama hangisinin gerçekleştiği kesin. Sınırı da
ölç: 09-21 reddedildi / 09-22 geçti — muhafızın "her şeyi bloke etmediğini"
ancak bu karşı-kanıt gösterir. Ayrıca `--out`/`--report`'u scratchpad'e yönlendir,
yoksa prob izlenen dokümanı yeniden yazar.

**Blocker sayısını değiştirmedim (4 → 4) ve bu doğru:** mayın temizlemek
ilerleme DEĞİLDİR; kartın başındaki insan aksiyonu (gerçek roster) duruyor.
Sahte yeşil üretmemek için kapı çıktısını değişiklikten sonra tekrar ölç.

[[fabrika-purge-detach-vs-retain-per-column]] ile aynı disiplin ailesi:
ikisinde de "test/kapı gerçekten reddediyor mu" sorusu kodun kendisinden önce gelir.
