---
sözleşme: 3
görev: TASK-MUPUHBAE811KP
kod: TASK-MUPUHBAE811KP
ajan: cs-fb
motor: claude
tip: rehber
okur: kullanıcı
hüküm: Bitti: SSS B7 (tr+en), Ş-3/Ş-4, §4 Y-3 satırı ve runbook EMEKLİ notu koda göre güncellendi ve cs-fb/y3-belge dalına commit'lendi; dal Y-3 dev'e girmeden birleştirilmemeli.
platform: mac (belge işi; davranış fe-fb/qa-y3-members dalındaki koddan okundu, uygulama koşulmadı). Belgelerin anlattığı yollar web arayüzünde; işletim sistemine bağlı adım yok, Windows/Linux için fark yok.
sürüm: 1
tarih: 2026-10-01T19:18:33.874Z
---

# Y-3 Ekip Üyeleri ekranı: destek belgeleri ekrana yönlendirildi

**Hüküm:** Bitti · **Tip:** docs (destek) · **Platform:** mac (yalnız belge; uygulama koşulmadı)

## 1. Ne yapıldı
- Dal `cs-fb/y3-belge` (taban `cs-fb/pilot-kararlar` @ 6473fbf8), worktree `/Users/macbook/alan/FONBRIDGE-wt-csfb-y3`. Push yok.
- `docs/beta/SSS-PILOT.md`
  - **B7 (tr+en) yeniden yazıldı:** Sahip/Yönetici, Ekip Üyeleri sayfasında **İptal** ve **Çıkar** düğmelerini kullanır. Kurallar: kişi kendini çıkaramaz; Sahip'i yalnız başka bir Sahip çıkarır; son Sahip çıkarılamaz; pilot bitmişse çıkarma/iptal kapalıdır. "ürüne eklenince" cümlesi kaldırıldı. Veri görülmüş olabilir uyarısı ve info@fonbridge.com'a yazma (P0 hedefi, G3) korundu. Rol değiştirme ekranda yok, yine yazılı talep.
  - **P-2 satırı:** ekran devrede; runbook yalnız yedek; KVKK/hukuk patronda.
- `docs/beta/DESTEK-SABLONLARI.md`
  - **Ş-3 (tr+en):** kullanıcı ekrana yönlendiriliyor. Ekran kullanılamazsa runbook'a gidiliyor. Yükseltme notu artık **her yanlış-üye vakasında** patrona gidiyor (kişi ekrandan çıkarılmış olsa da). P0 + KVKK/hukuk patronda kaldı.
  - **Dizin satırı Ş-3:** "Bilinen sorun" yerine "Doğrulanmış davranış".
  - **Kural 5:** Ş-3, geçici şablonlar listesinden çıkarıldı.
  - **Ş-4 (tr+en):** "hangi daveti iptal edelim, bize yazın" yerine ekrandan iptal/çıkarma.
  - **§4 Y-3 satırı:** üstü çizildi; yeni geçici yanıt yazıldı.
- `docs/destek/RUNBOOK-YANLIS-UYE.md`: dosya silinmedi.
  - Başa **EMEKLİ** notu eklendi: adım 4–6 yalnız ekran kullanılamazsa uygulanır. Adım 1 ve **adım 3 (KVKK/hukuk) ekran kullanılsa da geçerlidir.**
  - §1'deki emeklilik maddesi "Yapıldı" oldu.
  - R-5 güncellendi: ekran yolunda oturumun nasıl düştüğü koddan cevaplandı; elle DB silme yolu hâlâ açık.

## 2. Kanıt
Önce (`git grep -n -i -E "elle çıkar|ürüne eklenince|ekibe yükselt" -- docs/beta docs/destek`):
```
docs/beta/DESTEK-SABLONLARI.md:185:hemen yükselt. Üyeyi elle çıkarma işini yalnız **runbook'taki yetkili kişi** yapar; destek çıkarma
docs/beta/DESTEK-SABLONLARI.md:231:davetle sınır aşımı). ... "Y-2 şüphesi" yazıp ekibe yükseltin.
docs/beta/DESTEK-SABLONLARI.md:562:| Y-2 | ... | Ekibe yükselt, kullanıcıya söyleme | Ş-4 iç not |
docs/beta/DESTEK-SABLONLARI.md:563:| Y-3 | Üye listesi yok, ... yanlış üye için ekibe yükselt (elle çıkarma, tek yetkili kişi) | Ş-3 |
docs/beta/SSS-PILOT.md:168:kimliğinizi doğrularız. Ekibimiz üyeyi elle çıkarır. ... ürüne davet iptali ve üye
docs/beta/SSS-PILOT.md:561:| P-2 | ... ürün hazır olana kadar tek yetkili kişi elle çıkarır, kayıtla. ...
docs/destek/RUNBOOK-YANLIS-UYE.md:1:# Runbook (İÇ BELGE) — Yanlış kabul edilmiş üyeyi elle çıkarma
```
Sonra:
```
docs/beta/DESTEK-SABLONLARI.md:259:... "Y-2 şüphesi" yazıp ekibe yükseltin.
docs/beta/DESTEK-SABLONLARI.md:590:| Y-2 | (kullanıcı görmez) koltuk sayısı 6'yı aşabilir | Ekibe yükselt, kullanıcıya söyleme | Ş-4 iç not |
docs/destek/RUNBOOK-YANLIS-UYE.md:1:# Runbook (İÇ BELGE) — Yanlış kabul edilmiş üyeyi elle çıkarma
```
Kalan üç satır kasıtlı: ikisi Y-2 (koltuk yarışı, bu işin dışında), biri runbook başlığı (silme yok kuralı gereği duruyor).

`git log --oneline -3` / `git show --stat`:
```
5d2f33a1 docs(destek): runbook R-5 — ekran yolu cevaplandı (TASK-MUPUHBAE811KP)
d3831c3d docs(destek): Y-3 Ekip Üyeleri ekranı — SSS B7, Ş-3/Ş-4, §4 Y-3, runbook EMEKLİ notu (TASK-MUPUHBAE811KP)
6473fbf8 (taban)
 docs/beta/DESTEK-SABLONLARI.md    | 92 ++++++++-----
 docs/beta/SSS-PILOT.md            | 76 +++++++----
 docs/destek/RUNBOOK-YANLIS-UYE.md | 19(+1) ...
```

Davranışın kaynağı (dal `fe-fb/qa-y3-members` @ dd921881):
- `src/app/api/team/members/[id]/route.ts`: CANNOT_REMOVE_SELF, CANNOT_REMOVE_OWNER (Sahip'i yalnız Sahip çıkarır), LAST_OWNER.
- `src/lib/team/access.ts`: yalnız TENANT_OWNER ve TENANT_ADMIN.
- `settings/members/team-list.tsx`: düğme ve onay metinleri (İptal / Evet, iptal et / Çıkar / Evet, çıkar).
- `src/lib/auth.ts:700-755`: üyelik her istekte yeniden okunuyor.
- crw2-fb ONAY raporu: pilot bitince yazma işlemleri 403 veriyor, okuma çalışıyor.
- Ekran görüntüsü `TASK-MUPUHBAE811KP-ekran/07-cikarilan-uye-erisim.png`: çıkarılan üye "Bu kurumda artık üyeliğiniz yok…" mesajını görüyor.

## 3. Değişen dosyalar
- `docs/beta/SSS-PILOT.md`
- `docs/beta/DESTEK-SABLONLARI.md`
- `docs/destek/RUNBOOK-YANLIS-UYE.md`

## 4. Riskler
- **Birleştirme sırası:** bu dal ancak Y-3 (`fe-fb/qa-y3-members`) `dev`'e girdikten **sonra** birleştirilmeli. Önce birleşirse kullanıcı, olmayan bir ekrana yönlendirilir.
- **Kartta yazan yol yanlıştı ("Ayarlar → Üyeler"):** kodda böyle bir menü yok. Sol menüdeki "Ayarlar" Modüller sayfasına gidiyor (`SidebarNav.tsx:37`). Ekip Üyeleri sayfasına yalnız şu yollarla gidiliyor:
  - kullanıcı menüsü → **Abonelik & Krediler** → **Ekip üyelerini yönet →** (`BillingClient.tsx:349`);
  - doğrudan adres `/tr/<ws>/ayarlar/uyeler` ya da `/en/<ws>/settings/members`.

  Belgelere bu gerçek yol yazıldı. Kullanıcı açısından bu bir **UX boşluğu**: Ayarlar menüsüne "Üyeler" bağlantısı eklenmeli (fe-fb önerisi). Eklenirse B7, Ş-3 ve Ş-4'teki yol tarifi güncellenmeli.
- Rol adı: ekranda "Kurum Yöneticisi" yazıyor, SSS B3'te "Kiracı Yöneticisi". B7'de ekrandaki ad kullanıldı. B3 ayrıca hizalanabilir.
- Belge işi; ekran canlı tıklanmadı. Davranış koddan, crw2-fb ONAY raporundan ve fe-fb ekran görüntülerinden alındı.

## 5. Açık sorular
- Ş-5 iç notundaki "Aktif üye sayısı ölçütü … Y-3 çözülmeden konmaz" satırına dokunulmadı. Bu ölçütü koymak patron kararı.
- Runbook R-3, R-4 ve elle silme yolundaki R-5 hâlâ açık. Bunlar yalnız yedek prosedür için gerekli.
- Kanıt notunda bu raporun `TASK-MUPUHBAE811KP-crw2-fb.md` dosyasına yazılması isteniyordu. O dosya crw2-fb'nin ONAY raporu; üzerine yazmak inceleme kanıtını silerdi. Rapor, kartın "Rapor:" satırındaki `-cs-fb.md` yoluna yazıldı.

## 6. Sonraki adım
- qae-fb: Y-3 `dev`'e girdikten sonra `cs-fb/y3-belge` dalını (d3831c3d, 5d2f33a1) birleştir.
- fe-fb (öneri): Ayarlar menüsüne Üyeler bağlantısı ekle.
