---
name: fabrika-cross-tenant-calls-are-a-precondition-not-an-exception
description: Fabrika'da withTenant'a ALINAMAYAN 35 çağrı fabrika_app altında 0 satır döndürüyor — API anahtarı doğrulaması 401, KVKK/GDPR dışa aktarımı boş dosya, silme "başarılı" deyip hiçbir şey silmiyor; bunlar muafiyet değil rol geçişinin ön koşulu
metadata:
  type: project
  updatedAt: 2026-09-10
---

Tenant-bypass dilimleri "sarılabilir çağrıları sar" işidir. Geriye kalan, **bilerek sarılmayan** çağrılar bir muafiyet listesi gibi görünür — değildir. TASK-MTVRAZSUVLL9R'de `src/**` içinde 41 kapsamsız çağrı ölçüldü; 35'i kiracı kapsamı açısından DOĞRU (kiracı sorgunun cevabı, ya da soru bütün estate'i kapsıyor) ama `fabrika_app` (NOBYPASSRLS) açısından ÇALIŞMIYOR.

Aynı sorgu, `app.tenant_id` ayarlanmadan, iki rolde (salt-okunur sonda):

```
 table          | as fabrika | as fabrika_app | bunu kapsamsız okuyan
 Membership     |         15 |              0 | KVKK/GDPR dışa aktarım + silme + fatura portalı
 Opportunity    |         28 |              0 | KVKK/GDPR dışa aktarım + silme süpürmesi
 ModuleState    |         17 |              0 | platform-admin modül konsolu
 AiUsageLog     |          9 |              0 | KVKK/GDPR dışa aktarım
 Feedback       |          5 |              0 | platform-admin triyaj + beta özeti
 ApiKey         |          2 |              0 | API anahtarı doğrulaması
 Subscription   |          1 |              0 | platform plan konsolu
```

Somut karşılığı: **her API anahtarı isteği 401**; **veri sahibi dışa aktarımı BOŞ dosya**; **silme talebi hiçbir şey silmeden "başarılı" der** (KVKK/GDPR açısından en ağırı budur — hata değil, sessiz yokluk); admin konsolları boş ekran.

Bu çağrılar dört sınıfa ayrılıyor ve hiçbiri `withTenant`'a alınamaz: `tenant-discovery` (satırın kendisi kimlik bilgisi — API anahtarı hash'i, magic-token; kiracı sorgunun CEVABI), `subject-scoped` (KVKK/GDPR, `userId`'ye göre her kiracıya yayılıyor), `platform-admin` (`requirePlatformAdmin()` arkası konsollar), `cross-tenant-job` (cron fan-out; kiracı kümesi sorgunun ÇIKTISI).

**Why:** "Dilim N son" demek kolay, çünkü sarılabilir çağrılar bittiğinde iş bitmiş GÖRÜNÜR. Ama kalan çağrılar `fabrika` rolünün BYPASSRLS'ine sessizce bel bağlıyor. Rol geçişi yapıldığı gün bunlar hata FIRLATMAZ — 0 satır döner. Sessiz yokluk, gürültülü hatadan çok daha geç fark edilir; silme yolunda ise "sildim" diyen bir yalan üretir. Bu, [[fabrika-a-wrapped-slice-is-not-rls-ready]]'in tamamlayıcısı: o kısmi-sarmanın ürettiği tehlikeyi anlatıyor, bu ise hiç sarılamayanların.

**How to apply:** Bir tenant-bypass/RLS dilimini "son dilim" ilan etmeden önce, geriye kalan kapsamsız çağrıları SAY ve her birini `fabrika_app` altında ÖLÇ (`DATABASE_URL_RLS_TEST`, `app.tenant_id` kurmadan `select count(*)`). Sayı `fabrika` sütunundan farklıysa o çağrı hazır değildir — gerekçesi ne kadar iyi olursa olsun. Bu çağrılara `withTenant` değil, **yaptırımlı bir çapraz-kiracı yolu** gerekir (ayrı BYPASSRLS istemcisi, ya da `app.tenant_id` boşken de eşleşen ikinci politika kolu — sınıf başına farklı olabilir). Fabrika'da bu Dilim 6: TASK-MTVTPVTEBCF5Z. `pnpm rls:verify` "app.tenant_id yokken 20 tablo 0 döndü" diyerek bunu zaten kısmen söylüyor, ama HANGİ ÜRÜN YOLUNUN ona bağlı olduğunu söylemiyor — o eşlemeyi elle kur, yoksa uyarı soyut kalır ve kimse üstüne almaz.
