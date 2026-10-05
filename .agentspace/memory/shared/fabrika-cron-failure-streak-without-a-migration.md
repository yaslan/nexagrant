---
name: fabrika-cron-failure-streak-without-a-migration
description: Bir cron işinde "ardışık N başarısızlık" eşiği için modül değişkeni İŞE YARAMAZ (her çağrı taze süreç); recordAlert'in döndürdüğü repeatCount kalıcı sayaçtır, resolveAlerts sıfırlar — migration'sız tek kalıcı depo SystemAlert
metadata:
  type: project
  updatedAt: 2026-09-10
---

Fabrika'da bir zamanlanmış iş kendi sağlığı için "tek geçici hata alarm üretmesin, ama
üst üste N kez patlarsa uyarsın" istiyorsa, sayacı **kodda tutamazsın**: iş bir cron
çağrısı olarak koşar, modül düzeyindeki değişken her koşuda taze sıfırdır ve eşik
yapısal olarak asla erişilemez. Şemada `JobRun` benzeri bir koşum tablosu **yok**
(2026-09-10 itibarıyla; `grep -n "^model " prisma/schema.prisma`).

Migration açmadan işleyen desen (TASK-MTVRC1UGA3B6Y, `src/lib/inngest/jobs/alerts-sweep.ts`):

- **Sayaç = `recordAlert`'in dönüşündeki `repeatCount`.** Sabit bir `dedupeKey` ile
  `info` seviyesinde bir "breadcrumb" satırı yaz; katlanan satırın sayacı ardışık
  başarısızlık sayısıdır. `recordAlert` bu sayıyı zaten döndürüyor.
- **Eşik = ikinci bir satır.** `repeatCount >= threshold` olunca AYRI bir `dedupeKey` ile
  `error` satırı yaz. Seviye dedup kimliğinin parçası olduğu için tek satırı "yükseltmek"
  mümkün değil — iki satır doğru çözüm, biri kayıt biri alarm.
- **Sıfırlama = başarıda `resolveAlerts`.** Temiz koşu iki anahtarı da kapatır; kapanmış
  satır `findOpenDuplicate`'e aday olmadığı için sonraki hata TAZE satır açar, streak 1'den
  başlar. Bu olmadan bir gecelik takılmanın izi sonsuza dek açık kalır ve eşik aylar sonra
  alakasız hatalarla dolar.
- **Aşama/hata metni anahtara GİRMEZ**, `meta`'ya girer: sorgu A'da pazartesi, sorgu B'de
  salı patlayan iş iki problem değil iki başarısızlıktır; aşamayı anahtara koymak belirti
  her yer değiştirdiğinde sayacı sıfırlar.

Kabul edilen sınır: alarm, işin patladığı **aynı** veritabanına yazılır. `SystemAlert`
okunamaz/yazılamazsa `recordAlert` tekrar-arama sorgusunu bile koşamaz, `failed` döner ve
hiçbir şey saklanmaz. `recordAlert`'i "arama patlarsa körlemesine create et" yapmak
TASK-MTS80DUAF39Z8'in kaldırdığı satır selini geri getirir — yapma; sınırı belgele.

İlgili: [[fabrika-alert-dedupe-needs-stable-meta]], [[fabrika-dedupe-candidate-limit-caps-the-fold]]
