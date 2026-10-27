# FonBridge Uzman Ulaşım Asistanı

Excel dosyasındaki uzmanların (ad, soyad, uzmanlık alanı) listesini okuyup her uzman için FonBridge portalını tanıtan **kişiselleştirilmiş mesaj taslağı** üreten, gönderim durumunu takip eden ve hatırlatma yapan **ekip içinde ortak kullanılan yarı-otomatik bir asistan uygulamasıdır**.

---

## 🛡️ Önemli Tasarım İlkesi: Yarı Otomatik Çalışma

Uygulama **LinkedIn Kullanıcı Sözleşmesi**'ne tam uyumludur:
- ❌ LinkedIn'e otomatik giriş veya scraping yapmaz.
- ❌ Bot veya otomasyonla mesaj ya da bağlantı isteği göndermez.
- ✅ Kişiselleştirilmiş mesaj taslağını hazırlar ve tek tıkla kopyalatır.
- ✅ Güvenli bir tarayıcı arama bağlantısı (`LinkedIn'de Ara`) açar.
- ✅ Kullanıcı mesajı kendisi gönderir ve "Gönderdim" butonuna basarak durumu ve takip tarihini kaydeder.

---

## 🚀 Hızlı Başlangıç

### 1. Kurulum
Sanal ortam oluşturun ve gereksinimleri yükleyin:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Uygulamayı Başlatma
Streamlit arayüzünü başlatın:

```bash
streamlit run app.py
```

Tarayıcınızda açılan ekranda varsayılan yönetici hesabı ile giriş yapabilirsiniz:
- **E-posta:** `admin@fonbridge.com`
- **Parola:** `admin123`

*(Parola ve kullanıcı ayarlarını Ayarlar ekranından değiştirebilirsiniz).*

---

## 🧪 Testleri Çalıştırma

Tüm testleri (temizleme, tekilleştirme, şablonlar, günlük limitler, takip listesi, opt-out, KVKK silme ve 31.462 satırlık performans kıyaslaması) çalıştırmak için:

```bash
pytest
```

---

## 📂 Proje Yapısı

```
fonbridge_outreach/
├── app.py                 # Streamlit çok sayfalı arayüzü
├── config.py              # Varsayılan limitler, yollar ve durum sabitleri
├── requirements.txt       # Proje bağımlılıkları (pandas, openpyxl, streamlit, bcrypt, pytest)
├── README.md              # Kullanım ve kurulum rehberi
├── data/                  # SQLite veritabanı (fonbridge.db) ve otomatik yedekler
├── input/                 # Kullanıcının Excel/CSV dosyaları
├── output/                # Hata ve tekilleştirme raporları (hata_raporu.csv), dışa aktarımlar
├── src/
│   ├── db.py              # SQLite şema tanımları, indeksler ve başlangıç tohum verileri
│   ├── auth.py            # bcrypt parola hash'leme ve kullanıcı doğrulama
│   ├── cleaner.py         # Veri temizleme, boş satır atlama, tekilleştirme ve hata raporu
│   ├── importer.py        # Excel/CSV okuma, kolon eşleştirme ve yüksek performanslı toplu içe aktarma
│   ├── language.py        # Ada ve karakterlere göre dil tahmini (TR / EN / DE)
│   ├── templates.py       # Kişiselleştirilmiş şablon motoru ({ad}, {soyad}, {uzmanlik})
│   ├── tracker.py         # Durum takibi, kişi bazlı günlük limit, takip listesi ve KVKK silme
│   └── exporter.py        # Excel/CSV dışa aktarma ve tek tıkla veritabanı yedekleme
└── tests/
    ├── test_cleaner.py    # Temizleme ve hata raporlama testleri
    ├── test_importer.py   # İçe aktarma, tekilleştirme ve 31k satır performans testleri
    ├── test_templates.py  # Şablon değişken ve dil testleri
    ├── test_tracker.py    # Günlük limit, opt-out, denetim izi ve atama testleri
    ├── test_auth.py       # Kimlik doğrulama testleri
    ├── test_exporter.py   # Dışa aktarma ve yedekleme testleri
    └── fixtures/ornek_uzmanlar.xlsx
```

---

## 📋 Fonksiyonlar ve Ekranlar

1. **✉️ Mesaj Kuyruğu:** Sıradaki kişi, kişiye özel taslak ({ad}, {soyad}, {uzmanlik}), "Kopyala", "LinkedIn'de Ara", "Gönderdim", "Yanıt Geldi", "İlgilenmiyor", "Bir Daha Yazma". Üstte dinamik günlük limit göstergesi.
2. **📋 Uzman Listesi:** Segment, durum, dil ve metin aramasıyla filtreleme. Tek tıkla CSV ve Excel dışa aktarma.
3. **⏳ Takip Listesi:** "Gönderildi" üzerinden belirlenen gün (varsayılan 7 gün) geçen ve henüz yanıt alınmayan uzmanların listesi.
4. **📥 İçe Aktarma:** `.xlsx` ve `.csv` yükleme, kolon eşleştirme önizlemesi, otomatik dil ataması, mükerrer/hatalı satırlar için anında indirilebilir `hata_raporu.csv`.
5. **👥 Ekip ve Atamalar (Yönetici):** Ekip üyeleri yönetimi, kişi bazlı günlük limitler, segment bazlı uzman atamaları, ekip toplam gönderim tablosu.
6. **⚙️ Ayarlar ve Şablonlar (Yönetici):** TR/EN/DE şablonlarının ve segmente özel şablonların düzenlenmesi, genel günlük limit (varsayılan 50) ve takip süresi (varsayılan 7 gün) ayarları, tek tıkla SQLite anlık yedekleme.
