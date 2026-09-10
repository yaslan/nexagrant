---
name: fabrika-supervisor-failed-verdict-may-be-a-derived-path-miss
description: Supervisor "BASARISIZ · beklenen cikti yok" derken ESKI gorev kodundan turetilmis bir yola bakiyor olabilir — is aslinda bitmis olabilir, dosyayi ve git log'u kendin kontrol et
metadata:
  type: project
  updatedAt: 2026-09-09
---

2026-09-09: geli-tirici'ye **TASK-MTU2Y588AL1XQ** delege ettim. Supervisor sonucu
"**BAŞARISIZ** · pane exited (code 129) ve beklenen çıktı yok:
`docs/agent-results/TASK-MTU27KSLSJZ9I-geli-tirici-2.md`" diye bildirdi — yani aramaya
gittiği yol, o worker'ın **bir ÖNCEKİ** kartının kodundan türetilmişti, delege ettiğim
karttan değil.

Gerçek: iş BİTMİŞTİ. `docs/agent-results/TASK-MTU2Y588AL1XQ-geli-tirici.md` yazılmıştı ve
`ccc15b7 fix(efatura): derive withholding rate label from actual rates, not hardcoded "9/10"`
commit'i `dev`'e girmişti. Kod da doğruydu (grep ile teyit ettim: sabit "9/10" yalnız
yorumlarda kaldı).

Kural: "BAŞARISIZ" bildirimini KAPANIŞ değil, KONTROL emri say. Önce
`ls docs/agent-results/ | grep <KART-KODU>` ve `git log --oneline -5`; iş varsa değerlendir,
yoksa yeniden delege et. Aksi halde bitmiş işi ikinci kez yaptırırsın.

İlgili: [[fabrika-delegation-verdict-wrong-both-directions]] ·
[[fabrika-evidence-file-may-answer-a-different-task]]

## Tekrar (2026-09-10, blockzincir-pm — aynı ajan, ikinci kez)
Supervisor "BAŞARISIZ · pane exited (code 129) ve beklenen çıktı yok" dedi ve kanıt olarak
**tamamen başka bir görevin** dosyasını gösterdi (`TASK-MTU6I3V2R30M8-blok-zincir-denet-i-2.md`).
Gerçek: `git log` içinde `feffe4b docs(audit): TASK-MTSZ0AL4QP2CT — re-measure unwrapped tenant
prisma calls, 5-slice plan` duruyordu; rapor 21 KB, beş dilimlik plan, 79 satır sınıflandırma —
iş eksiksiz bitmişti. Kartı "yeniden yap" diye dağıtsaydım bir günlük denetim işi ikinci kez
koşacaktı.

Kural pekişti: `exit 129` hükmünü ASLA tek başına kabul etme; `git log --oneline -8 | grep <KART>`
ve `ls -la docs/agent-results/ | grep <KART>` iki komutla yeter. Aynı ajanda iki kez tekrarladı,
yani bu tesadüf değil — supervisor'ın türettiği yol ile ajanın yazdığı yol sistematik olarak
ayrışabiliyor.
