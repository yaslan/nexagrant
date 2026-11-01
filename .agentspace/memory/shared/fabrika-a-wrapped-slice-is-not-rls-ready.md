---
name: fabrika-a-wrapped-slice-is-not-rls-ready
description: Bir dosyanın tenant çağrılarını withTenant'a almak o yolu fabrika_app'e hazır YAPMAZ — kapsam dışı bırakılan tablo (AuditEvent) yeni tıkaç olur ve hata şekli "hiçbir şey yazılmadı"dan "para yazıldı, anahtar yazılmadı"ya döner
metadata:
  type: project
  updatedAt: 2026-09-10
---

Tenant-bypass dilimlerinde bir dosyanın 13 çağrısını `withTenant`'a almak, o yolu RLS'e tabi role hazır hale getirmez. `fabrika` (BYPASSRLS) altında ölçtüğün her şey yeşil görünür; asıl soru `fabrika_app` (NOBYPASSRLS) altında ne olduğudur ve orada **kapsam dışı bıraktığın tablo yeni tıkaç olur**.

TASK-MTVRACMDFRGKV'de ölçüldü (`src/lib/billing/subscription-sync.ts`, Stripe webhook):

```
fabrika_app, dilim ÖNCESİ: throw @ prisma.subscription.upsert  → Subscription 0, CreditLedger 0, AuditEvent 0
fabrika_app, dilim SONRASI: throw @ prisma.auditEvent.create   → Subscription 1, CreditLedger 1, AuditEvent 0
```

Sarma çalıştı (para yazmaları RLS'i geçiyor) ama `AuditEvent` — envanterin bilerek kapsam dışı bıraktığı model — sarmalayıcı dışında kaldığı için reddedildi. Ve `AuditEvent` burada idempotency anahtarıydı. Okuması da kör:

```
guard satırı fabrika (BYPASSRLS) ile görünür:        1
guard satırı fabrika_app, app.tenant_id yok:         0   <-- guard hiçbir zaman eşleşmez
guard satırı fabrika_app, app.tenant_id kurulu:      1
```

**Why:** İki ayrı tuzak var. (1) Bir dilimin "bitti"si, o dosyanın RLS'e hazır olduğu anlamına gelmez — kapsam dışı satırlar hâlâ orada ve rol geçişinde ilk onlar patlar. (2) Kısmen sarılmış bir yol, hiç sarılmamış bir yoldan **daha tehlikeli** bir başarısızlık şekli üretir: eskiden ilk yazma reddedilir ve hiçbir şey yazılmazdı (güvenle tekrar denenebilir), şimdi para yazılıp koruma satırı yazılamıyor. Stripe tekrar gönderir, guard da okuyamadığı için olay baştan işlenir → her tekrarda bir kredi tahsisi daha.

**How to apply:** Bir tenant-bypass dilimini bitirmeden önce handler'ı `DATABASE_URL=$DATABASE_URL_RLS_TEST` ile GERÇEKTEN koştur (fixture'ları ayrıcalıklı bağlantıyla kur, bkz. [[fabrika-rls-bypass-local-dev]]). Hangi çağrının ilk reddedildiğini ve o noktaya kadar KAÇ SATIR yazıldığını raporla. Sıfırdan farklıysa, dilimin bir kısmi-yazma penceresi bıraktığını adıyla söyle ve kartını aç — sessizce "dilim tamam" deme. Kapsam dışı bırakılan her tablo için "bu tablo bu yolda ne işe yarıyor?" diye sor: cevap "idempotency anahtarı" ya da "koruma satırı" ise kapsam dışı bırakmak masum bir tercih değildir. Bkz. TASK-MTVSBEO7VX6Y4, [[fabrika-app-role-is-necessary-but-not-sufficient-for-an-rls-test]].
