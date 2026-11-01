# Bu klasörün durumu (güncel: 01.11.2026, FO-260)

**Bu klasör YENİDEN KULLANIMDA.** Patron kararı K-574987 = **A**: NexaGrant, Hostinger'daki hazır
`nexagrant.com` Cloud hosting sitesine Node.js uygulaması olarak yüklenir. VPS alınmaz.
Paket bu klasördeki araçla üretilir (`build-package.sh` → `app.js` + `app/` Next standalone + `worker.sh`).

- Kurulum sırası ve runbook: `docs/DEPLOY-NEXAGRANT-HOSTINGER.md` (tek kaynak).
- Ortam değişkenleri: `ENV-LISTESI.md` (Hostinger yolları).
- `KURULUM.md`: eski Vulut cPanel ("Setup Node.js App") rehberi; kavramlar (paket içeriği, worker env dosyası,
  migration sırası) geçerli, ekran adları ve yollar Hostinger'da farklıdır.
- `deploy/vps/` (FO-244, Hostinger KVM 2): **bu hedef için kullanılmıyor**; dosyalar silinmedi.

Önceki not (FO-244, K-573894: "uygulama sunucusu KVM 2 VPS") K-574987 ile geçersiz kaldı.
Dosya adı, ona bağlantı veren belgeler kırılmasın diye değiştirilmedi.
