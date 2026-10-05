# TASK-MUMHVNJLRYQU9 — FB pilot test verisi temizliği · be-fb

## 1) Ne yapıldı

Yerel dev DB'den (`fabrika-postgres` konteyneri, `localhost:5433/fabrika`) yalnız şu test kiracıları ve kullanıcıları silindi. Silme tek transaction'da yapıldı:

- be-fb pilot testi: kiracı `cmumb155l002dndxkpviuw95z` ("Ilkadim-Pilot-Befb Kuruluşu"), kullanıcı `ilkadim-pilot-befb@example.test`.
- fe-fb Modüller sayfası testi (TASK-MUMH6W5I1W9WC): 11 kiracı ve 11 kullanıcı, `fefb-{none,pilot,pilot-expired,pro,outside}-<sayısal zaman damgası>@example.test`. fe-fb raporunda "10" yazıyor, ama desene uyan ve aynı 09:52–10:03 penceresinde oluşturulan satır sayısı 11.
- Bağlı satırlar: Membership 12, Workspace 12, Subscription 7, ModuleState 7, Invitation 1, AuditEvent 13, Consent 25.

Kart açıklamasındaki belge kısmı (M6 listesi) cs-fb kartına taşındı (kart başlığında yazıyor). Bu kartta belgeye dokunulmadı.

**Bilerek dokunulmayanlar:**

| Kiracı                                                 | Neden                                                                                                                                                                                                                                               |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cmumi0obu002tndxk0l2l4m48` "Crwfb-Pilot-Mumi0mfa"     | crw-fb'nin canlı pilot testi. Adında crw geçiyor.                                                                                                                                                                                                   |
| `cmumip89e0053ndxkcgy313l5` "Fefb-Pilot-Mumip77s"      | Başka bir fe-fb kartından (TASK-MUMIIUEGJ6N8B), Modüller testinden değil. Raporda "yeniden kullanılabilir" yazıyor ve crw-fb'nin yeniden doğrulamasında kullanılması bekleniyor. Sonek sayısal değil. Desenim `-[0-9]+` olduğu için dışarıda kaldı. |
| `cmulxeyfm0001m3xkc5me1fkf` "Kamu B11 Test Belediyesi" | Listede yok.                                                                                                                                                                                                                                        |
| Tüm `AgencyInviteCode` satırları (ajans davet kodları) | Silinen kiracılara bağlı kod satırı yoktu. Tabloya hiç yazılmadı.                                                                                                                                                                                   |

**Kapsam sınırı kontrolleri (silmeden önce, hepsi 0):** silinecek kullanıcıların başka kiracıda üyeliği yok. Silinecek kiracılarda başka kullanıcı yok. Bu kiracılara `agencyId` ile bağlı alt kiracı yok. `AuditEvent.actorId` kapsam dışına taşmıyor. `Consent` satırlarında kiracı ile kullanıcı eşleşmesi tutarlı. Tablolarda trigger yok. `fabrika` rolü süper kullanıcı, yani RLS silmeyi gizlemiyor.

`Consent` tablosunun `Tenant` ya da `User`'a FK'si yok. Bu yüzden Tenant silinince kaskadla gitmez, ayrıca silindi. Silinmeseydi 25 yetim KVKK satırı kalacaktı.

## 2) Kanıt

### Öncesi (SELECT)

```
 cmumb155l002dndxkpviuw95z | Ilkadim-Pilot-Befb Kuruluşu               | org-edfn2q
 cmumi00ia002nndxkgone5abn | Fefb-None-1790675568572 Kuruluşu          | org-nke0vg
 cmumi0w8u0031ndxkokafn1iy | Fefb-None-1790675609058 Kuruluşu          | org-kuhm00
 cmumi1tse0037ndxk1584zazs | Fefb-None-1790675652766 Kuruluşu          | org-ajltzm
 cmumi27w9003fndxku7phx575 | Fefb-Pilot-1790675671474 Kuruluşu         | org-kohk7p
 cmumi2lof003nndxkopel28xg | Fefb-Pilot-Expired-1790675689267 Kuruluşu | org-2hg85c
 cmumi2wvz003tndxk7bgu7k0r | Fefb-Pro-1790675703898 Kuruluşu           | org-o3xawl
 cmumi6fb40041ndxkj15g41jt | Fefb-None-1790675867711 Kuruluşu          | org-lca8fc
 cmumi6t8f0049ndxkga22gryn | Fefb-Pilot-1790675885744 Kuruluşu         | org-35n9fw
 cmumi772m004hndxkvkqtujx5 | Fefb-Pilot-Expired-1790675903722 Kuruluşu | org-sppan4
 cmumi7k9k004nndxk0psvgrdg | Fefb-Pro-1790675920279 Kuruluşu           | org-3et1yc
 cmumiduwe004vndxkaggb95qm | Fefb-Outside-1790676214566 Kuruluşu       | org-12lmc4
(12 rows)
 (users: ilkadim-pilot-befb@example.test + 11 × fefb-…@example.test — 12 rows)

     tbl      | count
 Membership   |    12
 Workspace    |    12
 Subscription |     7
 ModuleState  |     7
 Invitation   |     1     (cmumb397l002lndxkerc8foox, ilkadim-uye2-befb@example.test, MEMBER)
 AuditEvent   |    13     (module.state.changed 7, billing.pilot.granted 5, agency.invite.redeemed 1)
 Consent      |    25

 tenants_total | users_total
            61 |          54
```

### Silme (tek transaction, her adımda beklenen satır sayısı tutmazsa RAISE ile ROLLBACK)

```
BEGIN
NOTICE:  Consent 25
NOTICE:  AuditEvent 13
NOTICE:  Invitation 1
NOTICE:  ModuleState 7
NOTICE:  Subscription 7
NOTICE:  Membership 12
NOTICE:  Workspace 12
NOTICE:  Tenant 12
NOTICE:  User 12
COMMIT
```

### Sonrası (desenle değil, öncesinde listelenen 12+12 sabit ID ile)

```
 Tenant 0 | User 0 | Membership 0 | Workspace 0 | Subscription 0 | ModuleState 0
 Invitation 0 | AuditEvent 0 | Consent 0 | Account 0

 tenants_total | users_total
            49 |          42          ← 61−12, 54−12: başka satır gitmedi

 kalan test kiracıları: Fefb-Pilot-Mumip77s, Crwfb-Pilot-Mumi0mfa, Kamu B11 Test Belediyesi
```

### :3000 sayfaları (demo girişli gerçek oturum, Chromium headless-shell 1243)

```
/tr/admin/billing/plans 200 pageerrors 0 h1 Paket Yönetimi
  pilot-list: Crwfb-Pilot-Mumi0mfa Kuruluşu | Süresi doldu … | Fefb-Pilot-Mumip77s Kuruluşu | Süresi doldu …
/tr/ajans 200 pageerrors 0 h1 Ajans panosu   (b2v0219-ajans@example.org; huni, raporlar, davet kodları, ortak marka)
```

Kareler: `docs/agent-results/TASK-MUMHVNJLRYQU9-screenshots/01-admin-pilot-listesi.png`, `02-ajans-panosu.png`.

## 3) Değişen dosyalar

- Kod değişmedi. Yalnız bu rapor ve 2 kare.
- DB: yerel `fabrika`, yukarıdaki satırlar.

## 4) Riskler

- Geri alma yolu yok (dev test verisi, yedek alınmadı). Yeniden üretmek için ilgili testler tekrar koşulabilir.
- `B1 Test Ajansı (OKA)` hunisinde silinen be-fb kiracısı artık sayılmıyor. Beklenen davranış bu.

## 5) Açık sorular

- `Fefb-Pilot-Mumip77s` ve `Kamu B11 Test Belediyesi` de silinsin mi? crw-fb yeniden doğrulamayı bitirince fe-fb ya da patron karar verebilir.

## 6) Sonraki adım

- TASK-MUMAC8JELIZ5H (M2 testi + "Configuration" sayfası).

**Platform beyanı:** Doğrulama **mac** üzerinde yapıldı (Darwin 27, Docker Postgres 16, `next dev` :3000). İş yalnız SQL ve yerel DB'den ibaret, platforma bağlı kod yolu yok. Windows ve Linux'ta **koşulamadı**, çünkü makinede yalnız macOS var. Aynı SQL, aynı Postgres sürümünde aynı sonucu verir.
