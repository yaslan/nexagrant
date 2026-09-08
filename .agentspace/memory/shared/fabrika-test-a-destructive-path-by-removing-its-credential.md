---
name: fabrika-test-a-destructive-path-by-removing-its-credential
description: Geri alınamaz bir yolu (gerçek mail/ödeme/silme) gerçekten koşarak doğrulamanın güvenli yolu — korumayı test ederken kimlik bilgisini ortamdan ÇIKAR, böylece koruma çalışmazsa tek olası sonuç hatadır
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

Bir güvenlik korumasının ("bu ikinci kez göndermeyi reddetmeli") gerçekten çalıştığını **gerçek
koşumla** kanıtlaman gerekir — ama koşum başarısız olursa gerçek mail gider, gerçek para çeker.
Mock yazmak da kanıtı zayıflatır: mock'ladığın şey tam olarak riskli olan şeydir.

**Yol: koruma katmanının ARKASINDAKİ kimlik bilgisini ortamdan çıkar.**

```bash
env -u RESEND_API_KEY npx tsx scripts/esr-calibration.ts --survey --send --roster=<sahte> --out=<tmp>
```

Bu, sonucu ikiye ayırır ve ikisi de güvenlidir:
- **Korumam çalıştı** → beklediğim red mesajını görürüm (`--send refused: every partner … already in
  the send receipt`). Gerçek kanıt.
- **Korumam çalışmadı** → koşu koruma sonrası ilk adımda `--send requires RESEND_API_KEY` diye ölür.
  Hiçbir şey gönderilmez.

Yani **hiçbir dalda zarar yok**, ama başarı dalı hakiki uçtan-uca çalıştırmadır.

Bonus: aynı numara "eski kod gerçekten kötü müydü" kanıtı için de çalışır. 2026-09-08 /
TASK-MTQ2KL3JO4MK2'de eski betiği ([[fabrika-ab-baseline-without-git-stash]]
yöntemiyle yerine koyup) aynı girdiyle koşturdum: eski kod **hiç "skipped" satırı yazmadan** 1.
ortakta anahtar hatasına düştü — yani anahtar olsaydı zaten mail almış ortağa ikinci kez yollayacaktı.
Öncesi/sonrası farkı böyle kanıtlandı, tek bir mail çıkmadan.

Sahte roster'ı repoya değil scratchpad'e yaz ve `.invalid`/`example.com` gibi teslim edilemez alan
adı kullan — [[fabrika-e11-3-survey-was-never-sent]] roster'ın neden placeholder tutulduğunu anlatıyor.
