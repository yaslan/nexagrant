# Çağrı Özeti Modülü

Proje çağrısı belgelerinden (bağlantı, PDF, DOCX, HTML, TXT, MD) 12 bölümlü Türkçe özet üreten Flask modülü.
Mevcut bir Flask sitesine tek satırla eklenir.

## Kurulum

```bash
python3 -m venv .venv
.venv/bin/pip install flask anthropic markdown python-docx pypdf
```

Anahtarı ortam değişkeni olarak verin:

```bash
export ANTHROPIC_API_KEY=...
```

## Siteye ekleme

```python
from cagri_ozet_modulu import ozet_blueprint

app.register_blueprint(ozet_blueprint(url_prefix="/ozet"))
```

Sayfa `/ozet/` adresinde açılır. Ana uygulamanın yapması gerekenler:

- **Kimlik doğrulama:** Modül kimlik doğrulama içermez. Sayfayı kendi oturum sisteminizin arkasına koyun.
- **CSRF:** Form POST gönderir. Ana uygulamanızda CSRF koruması varsa form token'ını ekleyin.
- **Yükleme sınırı:** `app.config["MAX_CONTENT_LENGTH"]` ayarlayın. Modül dosya başına 25 MB sınırı uygular.
- **Anahtar:** `ozet_blueprint(api_key="...")` ile de verilebilir. Verilmezse `ANTHROPIC_API_KEY` kullanılır.

Sayfa bir parça (fragment) olarak üretilir. Stiller `.co-ozet` altında kapsanır ve sitenizin stillerini etkilemez.

## Güvenlik

- Bağlantılar yalnızca genel (global) IP adreslerine indirilir. Yerel ve özel ağ adresleri reddedilir.
- Yönlendirme hedefleri de aynı kontrolden geçer.
- Sınırlama: DNS yeniden bağlama (DNS rebinding) saldırısına karşı tam koruma yoktur. Dış kullanıcılara açık bir sitede, bağlantıları kullanıcıya bırakmak yerine sunucuda sabit bir kaynak listesiyle çalışmanız daha güvenlidir.

## Örnek site

```bash
.venv/bin/python ornek_site.py
```

Ardından `http://127.0.0.1:5000/ozet/` adresini açın.

## Komut satırı

```bash
.venv/bin/python cagri_ozet.py belge.pdf https://... -o ozet.md
```

## Yapı

| Dosya | İçerik |
|---|---|
| `cagri_ozet_modulu/cekirdek.py` | Metin çıkarma, güvenli indirme, model çağrısı. Flask bağımlılığı yok. |
| `cagri_ozet_modulu/__init__.py` | Flask Blueprint, sayfa şablonları ve stiller |
| `ornek_site.py` | Modülün bağlandığı örnek ana uygulama |
| `cagri_ozet.py` | Komut satırı arayüzü |

## Sınırlar

- Girdi toplamı 450 bin karakteri aşarsa işlem reddedilir. Daha büyük kaynak setleri için parçalı özet gerekir, henüz yok.
- Taranmış (görüntü tabanlı) PDF'lerden metin çıkmaz. OCR desteklenmiyor.
- Model çıktısı kaynak belgelere dayanır, ama kullanmadan önce belgeyle karşılaştırılmalıdır.
