"""Çağrı özeti çekirdeği: metin çıkarma, güvenli bağlantı indirme ve model çağrısı.

Web arayüzünden bağımsızdır; Flask olmadan da kullanılabilir.
"""

import io
import ipaddress
import socket
import urllib.request
from html.parser import HTMLParser
from urllib.parse import urlparse

import anthropic
from docx import Document
from pypdf import PdfReader

MODEL = "claude-sonnet-5-5"
MAX_CHARS = 450_000  # birleşik girdi sınırı (~150 bin token); daha uzun girdi için parçalama gerekir
MAX_CIKTI_TOKEN = 16_000  # çok kaynaklı 12 bölümlü özet için; kesilirse hata verilir
MAX_DOSYA_BAYT = 25 * 1024 * 1024  # indirilen ya da yüklenen tek dosya sınırı
ZAMAN_ASIMI = 30  # saniye

SISTEM_PROMPTU = """Sen bir Ar-Ge proje çağrılarını Türkçe özetleyen uzmansın.
Sana verilen belgelerden yalnızca belgede yazan bilgileri kullan; tahmin etme.
Bilgi belgede yoksa "Belgelerde belirtilmemiştir" yaz.
Çıktıyı aşağıdaki başlıklar ve sırayla Markdown olarak ver:

## 1. Program Adı
## 2. Hibe Sağlayıcı Kurum / Kaynak
## 3. Amacı
## 4. Kimler Başvurabilir?
## 5. Bütçesi
## 6. Destek Oranı
## 7. Süresi
## 8. Son Başvuru Tarihleri   (tablo: Aşama | Tarih ve Saat | Saat dilimi)
## 9. Nasıl Başvurulur?
## 10. Programa Ait Özellikler
## 11. Detaylı Bilgi / Rehber
## 12. İletişim

Sayılar, tarihler ve para birimleri belgedeki biçimiyle aynen aktarılmalı.
Son satıra, özetin hangi belgelere dayandığını "Kaynak belgeler: ..." olarak ekle."""


class OzetHatasi(ValueError):
    """Kullanıcıya gösterilebilecek, beklenen hatalar için."""


class _HtmlMetin(HTMLParser):
    """HTML sayfasından görünür metni çıkarır; script ve style içeriğini atlar."""

    def __init__(self) -> None:
        super().__init__()
        self.parcalar: list[str] = []
        self._atla = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self._atla += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self._atla:
            self._atla -= 1

    def handle_data(self, data):
        if not self._atla and data.strip():
            self.parcalar.append(data.strip())


def metin_cikar(ad: str, veri: bytes, icerik_turu: str = "") -> str:
    """Dosya adı ya da içerik türüne göre PDF, DOCX, HTML veya düz metinden metin çıkarır."""
    kucuk_ad = ad.lower()
    if kucuk_ad.endswith(".pdf") or "pdf" in icerik_turu:
        return "\n".join(sayfa.extract_text() or "" for sayfa in PdfReader(io.BytesIO(veri)).pages)
    if kucuk_ad.endswith(".docx") or "wordprocessingml" in icerik_turu:
        doc = Document(io.BytesIO(veri))
        parcalar = [p.text for p in doc.paragraphs]
        for tablo in doc.tables:
            for satir in tablo.rows:
                parcalar.append(" | ".join(hucre.text for hucre in satir.cells))
        return "\n".join(parcalar)
    if kucuk_ad.endswith((".html", ".htm")) or "html" in icerik_turu:
        ayristirici = _HtmlMetin()
        ayristirici.feed(veri.decode("utf-8", errors="replace"))
        return "\n".join(ayristirici.parcalar)
    if kucuk_ad.endswith((".txt", ".md")) or icerik_turu.startswith("text/"):
        return veri.decode("utf-8", errors="replace")
    raise OzetHatasi(f"Desteklenmeyen dosya türü: {ad}")


def _adres_guvenli_mi(ana_bilgisayar: str) -> bool:
    """Ana bilgisayarın tüm çözümlenen adreslerinin genel (global) IP olduğunu doğrular."""
    try:
        kayitlar = socket.getaddrinfo(ana_bilgisayar, None)
    except socket.gaierror:
        return False
    for kayit in kayitlar:
        ip = ipaddress.ip_address(kayit[4][0])
        if not ip.is_global:
            return False
    return True


def _url_guvenli_kontrol(url: str) -> None:
    """Yalnızca genel http(s) adreslerine izin verir; yerel ve özel ağları reddeder."""
    ayrisim = urlparse(url)
    if ayrisim.scheme not in ("http", "https") or not ayrisim.hostname:
        raise OzetHatasi(f"Yalnızca http(s) bağlantıları desteklenir: {url}")
    if not _adres_guvenli_mi(ayrisim.hostname):
        raise OzetHatasi(f"Bu adrese erişilemez (yerel veya özel ağ): {url}")


class _GuvenliYonlendirme(urllib.request.HTTPRedirectHandler):
    """Her yönlendirme hedefini de aynı güvenlik kontrolünden geçirir."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _url_guvenli_kontrol(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_acici = urllib.request.build_opener(_GuvenliYonlendirme())


def url_al(url: str) -> tuple[str, str]:
    """Bağlantıyı güvenle indirir ve (kaynak adı, metin) döndürür."""
    _url_guvenli_kontrol(url)
    istek = urllib.request.Request(url, headers={"User-Agent": "CagriOzetiModulu/1.0"})
    with _acici.open(istek, timeout=ZAMAN_ASIMI) as yanit:
        icerik_turu = yanit.headers.get("Content-Type", "").lower()
        veri = yanit.read(MAX_DOSYA_BAYT + 1)
    if len(veri) > MAX_DOSYA_BAYT:
        raise OzetHatasi(f"Bağlantıdaki dosya çok büyük (sınır {MAX_DOSYA_BAYT // (1024 * 1024)} MB): {url}")
    ad = url.rstrip("/").rsplit("/", 1)[-1] or url
    return ad, metin_cikar(ad, veri, icerik_turu)


def dosya_al(yol) -> tuple[str, str]:
    """Yerel bir dosyadan (kaynak adı, metin) döndürür."""
    return yol.name, metin_cikar(yol.name, yol.read_bytes())


def belgeleri_birlestir(parcalar: list[tuple[str, str]]) -> str:
    """(kaynak adı, metin) çiftlerini tek bir girdi metnine çevirir."""
    birlesik = "\n\n".join(f'<belge ad="{ad}">\n{metin}\n</belge>' for ad, metin in parcalar)
    if len(birlesik) > MAX_CHARS:
        raise OzetHatasi(f"Girdi {len(birlesik)} karakter; sınır {MAX_CHARS}. Belgeleri bölün.")
    return birlesik


def ozet_uret(belge_metni: str, kaynak_adlari: list[str], api_key: str | None = None) -> str:
    """Belge metninden 12 bölümlü Türkçe özet üretir.

    api_key verilmezse ANTHROPIC_API_KEY ortam değişkeni kullanılır.
    """
    istemci = anthropic.Anthropic(api_key=api_key)
    yanit = istemci.messages.create(
        model=MODEL,
        max_tokens=MAX_CIKTI_TOKEN,
        system=SISTEM_PROMPTU,
        messages=[
            {
                "role": "user",
                "content": f"Kaynak belgeler: {', '.join(kaynak_adlari)}\n\n{belge_metni}",
            }
        ],
    )
    if yanit.stop_reason == "max_tokens":
        raise OzetHatasi("Özet çıktı sınırına takıldı ve yarım kaldı. Daha az kaynakla deneyin.")
    return "".join(blok.text for blok in yanit.content if blok.type == "text")
