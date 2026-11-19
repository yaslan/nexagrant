# Bu klasörün durumu (güncel: 01.11.2026, FO-260)

> **YÖNLENDİRME (NG-262, 19.11.2026): aşağıdaki "VPS alınmaz" kararı K-584192 = C ve K-584515 = A ile yerine geçildi** (`docs/adr/ADR-0012-hosting-hostinger-cloud-to-vps.md`). Patron Hostinger **KVM 4** VPS'ini aldı (`191.96.1.252`, Ubuntu 24.04 + CloudPanel); veritabanı Supabase'te kalır. **Taşıma YAPILMADI, planlı** (NG-261). Bu klasör, taşıma bitene ve 14 günlük geri dönüş süresi dolana kadar bugünkü canlı hedef (Hostinger Cloud) için geçerlidir.

**Bu klasör YENİDEN KULLANIMDA.** Patron kararı K-574987 = **A**: NexaGrant, Hostinger'daki hazır
`nexagrant.com` Cloud hosting sitesine Node.js uygulaması olarak yüklenir. VPS alınmaz.
Paket bu klasördeki araçla üretilir (`build-package.sh` → `app.js` + `app/` Next standalone + `worker.sh`).

- Kurulum sırası ve runbook: `docs/DEPLOY-NEXAGRANT-HOSTINGER.md` (tek kaynak).
- Ortam değişkenleri: `ENV-LISTESI.md` (Hostinger yolları).
- `KURULUM.md`: eski Vulut cPanel ("Setup Node.js App") rehberi; kavramlar (paket içeriği, worker env dosyası,
  migration sırası) geçerli, ekran adları ve yollar Hostinger'da farklıdır.
- `deploy/vps/` (FO-244; KVM 2 için yazılmıştı): **bu (Cloud) hedef için kullanılmıyor**; dosyalar silinmedi. Yeni hedef KVM 4 + CloudPanel için uyarlanması planlı (NG-261 Faz A).

Önceki not (FO-244, K-573894: "uygulama sunucusu KVM 2 VPS") K-574987 ile geçersiz kalmıştı; 19.11.2026'da VPS yönü K-584192 = C ile geri döndü, sunucu KVM 4 oldu (ADR-0012).
Dosya adı, ona bağlantı veren belgeler kırılmasın diye değiştirilmedi.
