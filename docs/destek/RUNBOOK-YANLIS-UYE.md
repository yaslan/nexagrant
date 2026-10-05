# Runbook (İÇ BELGE) — Yanlış kabul edilmiş üyeyi elle çıkarma

> **⚠ EMEKLİ — QA Y-3 Ekip Üyeleri ekranı devrede (kart TASK-MUPUHBAE811KP).** Yanlış üyeyi ve yanlış
> daveti artık Kurum Sahibi / Kurum Yöneticisi ekrandan çıkarır/iptal eder (müşteri metni: SSS B7,
> Ş-3). Bu runbook'un **adım 4–6'sı (elle DB silme) yalnız ekran kullanılamazsa** yedek prosedürdür:
> pilot süresi bitmiş kiracı (ekranda çıkarma/iptal kapalı), ekran hatası, ya da kurumda işlemi
> yapabilecek Sahip/Yönetici yok.
>
> **Ekran kullanılsa da geçerli olanlar:** adım 1 (kayıt, yanlış kişi katıldıysa **P0**) ve **adım 3
> (olay / KVKK değerlendirmesi; hukuka ve veri sorumlusuna bildirim — sahibi patron, R-2)**. Ekrandan
> çıkarma, kişinin çıkarılana kadar veri görmüş olabileceği gerçeğini değiştirmez.
>
> Ekranın kendi davranışı (koddan, `docs/agent-results/TASK-MUPUHBAE811KP-crw2-fb.md` ONAY): çıkarma
> `Membership` satırını siler ve `member.removed` audit kaydı yazar; davet iptali `invitation.cancelled`
> yazar. Çıkarılan kişinin oturumu, oturum her istekte üyeliği yeniden okuduğu için bir sonraki isteğinde
> kurum erişimini kaybeder (`src/lib/auth.ts`) — bu R-5'in ekran yolu için cevabıdır; elle DB silmesinde
> de aynı kod yolu çalışır ama yedek prosedürde ayrıca doğrulanmadı. Bu not Y-3 `dev`'e birleştiğinde
> geçerlidir.

> Sürüm 1.0 · 01.10.2026 · Hazırlayan: CS-FB · Kart: TASK-MUPV41M8BYQXF (FB-GAP-1)
>
> **İç belge. Müşteriye, SSS'e ya da destek yanıtına KOYULMAZ.** Müşteriye giden metin: `docs/beta/SSS-PILOT.md` B7 ve `docs/beta/DESTEK-SABLONLARI.md` Ş-3.
> Dayanak: patron kararı K-4 (01.10.2026) ve `docs/agent-results/TASK-MUPA7F7HPV3OX-prm-fb-2.md` §2.

## 1. Ne zaman, ne kadar süre geçerli

- Üründe `membership.delete` yok; `invitation.delete` yalnız `src/lib/invitations/retention.ts`'te (QA Y-3, kart **TASK-MUPUHBAE811KP**). Yanlış kabul edilmiş **üye** kendiliğinden düşmez; koltuk kalıcıdır. (Yalnız yanlış **davet** 7 günde düşer.)
- **Karar K-4:** Y-3 ekranı (üye listesi + çıkarma + davet iptali) hazır olana kadar yanlış üye çıkarma **tek yetkili kişi** tarafından, **elle ve kayıtla** yapılır.
- Y-3 kapanınca bu runbook emekli olur: SSS B7 ve Ş-3 silinir/güncellenir (`DESTEK-SABLONLARI` kural 5). **Yapıldı** — bkz. baştaki EMEKLİ notu; SSS B7 ve Ş-3 ekrana yönlendiriyor.

## 2. Kim yapar

| Rol | Kim | Ne yapar |
| --- | --- | -------- |
| **Yetkili kişi (tek)** | **Patron (platform yöneticisi)** — patron kararı 01.10.2026 | Adım 4–6'yı (DB'de silme, audit kaydı, doğrulama) yapar. Başka kimse çıkarma yapmaz. |
| Destek (CS) | CS-FB / destek sahibi | Adım 1–2: talebi kaydeder, kimliği doğrular, yetkili kişiye yükseltir. **Silme yapmaz.** |
| Hukuk / veri sorumlusu bildirim sahibi | **Patron** — patron kararı 01.10.2026 (hukuka ve veri sorumlusuna bildirimi kendisi yapar) | Adım 3: KVKK değerlendirmesi. İhlal bildirimi kararı hukukundur. |

## 3. Adımlar

1. **Talep ve kayıt.** Talep yalnız **info@fonbridge.com**'a gelir. `DESTEK-SABLONLARI.md` §3 formuna kaydedilir (alan 4 "Talep edenin rolü"). Yanlış kişi katıldıysa öncelik **P0**'dır (veri görmüş olabilir; ilk yanıt hedefi iş saatleri içinde 2 saat, taahhüt değil). Yalnız yanlış adrese giden davet **P2**'dir (7 günde düşer).
2. **Talep edenin kimlik doğrulaması.** E-posta tek başına yetmez (sahteciliğe açık). Gönderen adres, kiracıdaki Kurum Sahibi / Kiracı Yöneticisi üyenin **kayıtlı** adresiyle eşleşmeli. Eşleşmiyorsa ya da kuşku varsa, **kayıtlı** adrese geri-doğrulama e-postası yazılır; yanıt gelmeden devam edilmez. Yalnız Sahip/Yönetici talebi işlenir (SSS B3). *[DOĞRULANMADI: kayıtlı adresi hangi sorguyla kimin kontrol edeceği — yetkili kişi ilk vakada belirler ve bu satıra yazar.]*
3. **Olay / KVKK değerlendirmesi (çıkarmadan ÖNCE başlar).** Yanlış kişi katıldığı andan çıkarılana kadar kiracı verisini görmüş olabilir. Yetkili kişi kişinin katılma zamanını (`Membership.createdAt`) ve varsa erişim kayıtlarını çıkarır. Veri sorumlusuna (belediye; FonBridge işleyen) ve hukuka bilgi verilir. İhlal bildirimi gerekip gerekmediği (KVKK md. 12 kapsamı, 72 saat) **hukuk kararıdır**; bu runbook hüküm vermez. Kiracı verisi sızıntısı şüphesi BETA_GUIDE'da zaten **P0**'dır. Değerlendirme sonucu kayda yazılır.
4. **Çıkarma.** `Membership` satırı **ve** o kişiye ait `Invitation` satırı (bekleyen ya da kabul edilmiş) **birlikte** silinir. Yalnız koltuğu boşaltmak yetmez: davet bağlantısı 7 gün geçerli kalır ve yanlış adresin sahibi yine kabul edebilir. Silmeden önce iki satırın `id` ve alanları kayda kopyalanır (geri alma ve audit için). *[DOĞRULANMADI: çıkarılan kişinin açık oturumunun ne zaman düştüğü. Kod ile kanıtlanana dek oturumun ayrıca sonlandırılması bu adıma dahildir.]*
5. **Audit kaydı.** Doğrudan DB silmesi `AuditEvent` üretmez; kanıtsız silme olmaz. İşlem **iç kayıt (form) + elle audit kaydı** ile belgelenir: kim yaptı, ne zaman, hangi satırlar (id), kimin talebi, gerekçe, adım 2 ve 3 sonucu. Elle `AuditEvent` yazılacaksa `type` ve `data` biçimi yetkili kişi tarafından ilk vakada belirlenir ve bu runbook'a eklenir. Kayıtta **tam e-posta yazılmaz**, maskeli yazılır (`u***@…`).
6. **Sonuç doğrulama.** Koltuk kullanımı (`readSeatUsage`) yeniden kontrol edilir; QA Y-2 (eşzamanlı davet yarışı) nedeniyle sayı tutarsız olabilir, tutarsızsa yükseltilir. Kullanıcıya Ş-3 / Ş-10 ile kapanış yazılır.

## 4. Yapılmayacaklar

- Bu işlemi destek, stajyer ya da yetkisiz bir kişi yapmaz.
- Talep eden doğrulanmadan silme yapılmaz.
- Müşteriye adım listesi, tablo adları ya da "DB'den siliyoruz" ayrıntısı verilmez; müşteri metni Ş-3'tedir.
- Başka kullanıcının adı/e-postası yanıta yazılmaz (`DESTEK-SABLONLARI` kural 4).
- Süre sözü verilmez; yalnız SSS G3'teki hedef tablosu ("hedef, taahhüt değil") kullanılır.

## 5. Açık maddeler (patron / yetkili kişi)

| No | Madde |
| -- | ----- |
| R-1 | ~~Yetkili kişinin adı (§2).~~ **Karar verildi** (01.10.2026): patron. |
| R-2 | ~~KVKK / hukuk bildirim sahibinin adı (§2).~~ **Karar verildi** (01.10.2026): patron. |
| R-3 | Kayıtlı adres doğrulama yöntemi (adım 2). |
| R-4 | Elle `AuditEvent` biçimi (adım 5). |
| R-5 | Çıkarılan kişinin oturumunun düşme davranışı (adım 4). Ekran yolu için kodla cevaplandı (baştaki EMEKLİ notu; Y-3 `dev`'e girince geçerli). Elle DB silme yolu ayrıca doğrulanmadı. |
