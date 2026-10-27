# 🚀 FonBridge Uzman Ulaşım Modülü — Entegrasyon & Paket Yönetim Rehberi

Bu belge, **Uzman Ulaşım Asistanı (Expert Outreach Assistant)** bileşeninin FonBridge ana platformuna tak-çalıştır (**pluggable module**) olarak nasıl entegre edileceğini, dağıtım modellerini ve paket satış yapılandırmasını açıklar.

---

## 📌 1. Modül Kimliği ve Özellikler

- **Modül Kimliği (`id`):** `expert_outreach`
- **Modül Adı:** `Uzman Ulaşım Asistanı (Expert Outreach Assistant)`
- **Sürüm:** `1.0.0`
- **Temel Yetenekler:**
  - 🇪🇺 **24 AB Resmi Dili + Türkçe:** 31.400+ Avrupa fonlama hakemi ve uzmanının etnik/dil ontolojisiyle ana dilinin otomatik tespiti.
  - 🛡️ **%100 LinkedIn Güvenli (Anti-Bot):** Otomasyon botu veya web scraping riski olmadan, tek tıkla LinkedIn arama bağlantısı ve güvenli panoya kopyalama.
  - 👥 **Ekip İçi Dağıtım ve Kotalar:** Günlük kullanıcı başı limitler (10-50/gün), uzmanlık segment atamaları ve 7 günlük takip (follow-up) mekanizması.
  - 🔒 **GDPR & KVKK Uyumlu:** Bireysel veri silme ve güvenli SQLite/PostgreSQL veri tabanı yedeği.

---

## 🎛️ 2. Çalışma ve Paket Dağıtım Modelleri

Modül, sistem yöneticisi veya ana platform tarafından **3 farklı modda** çalıştırılabilir:

| Mod Kodu | Arayüz Etiketi | Açıklama |
| :--- | :--- | :--- |
| `standart` | 🟢 Standart (Tüm Kullanıcılara Açık) | FonBridge'e üye olan tüm kullanıcılar bu modüle **ücretsiz / temel özellik** olarak erişebilir. |
| `paket_eklenti` | 🟡 Paket / Eklenti Olarak Satış | Modül yalnızca izin verilen abonelik paketlerine (`Pro`, `Enterprise`, `Outreach Add-on`) veya **bireysel modül lisansı** tanımlanmış kullanıcılara açılır. Diğer kullanıcılara yüksek dönüşümlü **Vitrin / Yükseltme Sayfası** gösterilir. |
| `devre_disi` | 🔴 Devre Dışı (Bakım Modu) | Modül genel kullanıma kapatılır; yalnızca yöneticiler (`yonetici`) test amaçlı görüntüleyebilir. |

---

## 💻 3. Ana FonBridge Projesine Entegrasyon (Python API)

Ana FonBridge projenizde bu modülü çağırmak ve yetki denetimi yapmak için kök dizindeki [fonbridge_module.py](file:///Users/macbook/alan/fonlink/fonbridge_module.py) sınıfını kullanabilirsiniz:

```python
import sqlite3
from fonbridge_module import FonBridgeOutreachModule

# 1. Veritabanı bağlantısı ile modülü başlatın
conn = sqlite3.connect("data/fonbridge.db")
outreach_mod = FonBridgeOutreachModule(conn)

# 2. Modül Manifestini Sorgulayın
manifest = outreach_mod.get_manifest()
print(manifest["name"], manifest["version"])

# 3. Giriş yapan kullanıcının bu modüle erişim hakkını denetleyin
current_user = {
    "id": 12,
    "ad_soyad": "Ahmet Yılmaz",
    "rol": "uye",
    "paket": "Standart",
    "moduller": ""
}

has_access, reason = outreach_mod.check_access(current_user)
if has_access:
    print("Modül arayüzü açılıyor...")
else:
    print("Erişim kısıtlı! Vitrin gösteriliyor. Neden:", reason)

# 4. Modülün çalışma modunu ve fiyatını dinamik olarak değiştirin
outreach_mod.set_mode(
    mode="paket_eklenti",
    allowed_plans=["Pro", "Enterprise"],
    price="₺4.990 / ay"
)

# 5. Kullanıcıya özel eklenti lisansı tanımlayın veya kaldırın
outreach_mod.grant_license(user_id=12)
outreach_mod.revoke_license(user_id=12)
```

---

## 🗄️ 4. Veritabanı Şeması & Lisanslama Alanları

`users` tablosuna eklenen yeni alanlar:

- `paket TEXT DEFAULT 'Standart'`: Kullanıcının sahip olduğu FonBridge abonelik paketi (`Standart`, `Pro`, `Enterprise`, `Outreach Add-on`).
- `moduller TEXT DEFAULT ''`: Kullanıcının satın aldığı virgülle ayrılmış bağımsız eklenti anahtarları (örn: `expert_outreach,crm_sync`).

`settings` tablosundaki modül anahtarları:

- `module_outreach_mode`: `standart` | `paket_eklenti` | `devre_disi`
- `module_outreach_allowed_plans`: `Pro,Enterprise,Outreach Add-on`
- `module_outreach_price`: `₺4.990 / ay` (veya `$49 / Ay`)
- `module_outreach_promo_title`: Vitrin başlığı
- `module_outreach_promo_desc`: Vitrin tanıtım metni

---

## 🖥️ 5. Kullanıcı ve Yönetici Deneyimi

1. **Kenar Çubuğu (Sidebar):**
   - Kullanıcının mevcut paketi (`Paket: Pro`) ve modül lisans rozeti (`🧩 Uzman Modülü: ✅ Aktif` veya `🔒 Kilitli`) listelenir.
   - Yöneticiler için **"Vitrin Sayfasını Önizle"** butonu ile kilitli kullanıcı deneyimi tek tıkla test edilebilir.
2. **Kilitli Kullanıcı Vitrini (`render_upsell_page`):**
   - Modül kilitli olduğunda doğrudan satış ve tanıtım sayfası açılır.
   - 24 AB Dili, 31.400+ uzman, LinkedIn anti-bot güvenliği ve ekip yönetimi vurgulanır.
   - Kullanıcı doğrudan "Paketimi Yükselt / Satın Alma Talebi Gönder" formu üzerinden talep iletebilir.
3. **Yönetim Paneli (`⚙️ Ayarlar ve Şablonlar` -> `🧩 Modül ve Paket Yönetimi`):**
   - Çalışma modeli seçimi (`Standart` / `Paket Satış` / `Devre Dışı`).
   - Fiyat, dahil olan paketler ve vitrin metinleri düzenleyicisi.
   - Tüm ekip üyelerinin paket ve lisans durumunu gösteren interaktif tablo; tek tıkla lisans verme/kaldırma ve paket değiştirme.
