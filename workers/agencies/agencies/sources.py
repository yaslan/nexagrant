"""Source register and robots/terms decisions for the TR agency collectors (NG-144).

Each entry records the decision made from the site's own robots.txt and terms
pages. A source is collected only when its status is ``open``. Anything that
forbids automated access, or whose position could not be established, is
``disabled`` and has no adapter (card NG-144, Faz 1 rule).

Decision date: 2026-11-13. Re-check the robots/terms before enabling a source
or after a site redesign.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Status = Literal["open", "disabled"]


@dataclass(frozen=True)
class Source:
    key: str
    name: str
    url: str
    robots: str
    terms: str
    status: Status
    reason: str


SOURCES: tuple[Source, ...] = (
    Source(
        key="istka",
        name="İstanbul Kalkınma Ajansı (İSTKA)",
        url="https://istka.org.tr/acik-destek-programlari",
        robots="izin: Disallow boş (tüm yollar açık)",
        terms="kullanim-kosullari + yasal-uyari-ve-gizlilik tarandı; otomatik erişim yasağı yok",
        status="open",
        reason="robots açık, şartlarda yasak ifadesi yok",
    ),
    Source(
        key="ua",
        name="Türkiye Ulusal Ajansı (AB programları)",
        url="https://www.ua.gov.tr/anasayfa/",
        robots="robots.txt yok (404); RFC 9309 gereği kısıt yok",
        terms="yasal-uyari-metni tarandı; otomatik erişim yasağı yok",
        status="open",
        reason="robots yok, yasal uyarıda yasak yok",
    ),
    Source(
        key="oka",
        name="Orta Karadeniz Kalkınma Ajansı (OKA)",
        url="https://oka.gov.tr/",
        robots="robots.txt yok: istek HTML ana sayfa döndürüyor",
        terms="şart sayfası bulunamadı",
        status="disabled",
        reason="belirsiz: robots geçersiz, şart sayfası yok",
    ),
    Source(
        key="baka",
        name="Batı Akdeniz Kalkınma Ajansı (BAKA)",
        url="https://www.baka.gov.tr/",
        robots="robots.txt 200 ama gövde boş",
        terms="şart sayfası bulunamadı",
        status="disabled",
        reason="belirsiz: robots boş, şart sayfası yok",
    ),
    Source(
        key="bebka",
        name="Bursa Eskişehir Bilecik Kalkınma Ajansı (BEBKA)",
        url="https://bebka.org.tr/",
        robots="izin: wp-admin ve woocommerce yolları dışında açık",
        terms="kullanım şartları bulunamadı; yalnız KVKK aydınlatma metni var",
        status="disabled",
        reason="belirsiz: kullanım şartı sayfası yok",
    ),
    Source(
        key="izka",
        name="İzmir Kalkınma Ajansı (İZKA)",
        url="https://izka.org.tr/",
        robots="izin: yalnız /wp-admin/ kapalı",
        terms="kullanım şartı sayfası bulunamadı; yalnız gizlilik sözleşmesi PDF'i var",
        status="disabled",
        reason="belirsiz: kullanım şartı sayfası yok",
    ),
    Source(
        key="ankaraka",
        name="Ankara Kalkınma Ajansı (ANKARAKA)",
        url="https://www.ankaraka.org.tr/",
        robots="Drupal robots: /core/, /admin/, /user/ vb. kapalı; çekirdek sayfalar açık",
        terms="kullanım şartı sayfası bulunamadı",
        status="disabled",
        reason="belirsiz: şart sayfası yok",
    ),
    Source(
        key="marka",
        name="Marmara Kalkınma Ajansı (MARKA)",
        url="https://marka.org.tr/",
        robots="izin: /wp-admin/ dışı açık",
        terms="gizlilik politikası tarandı (yorum/KVKK metni); kullanım şartı yok",
        status="disabled",
        reason="belirsiz: kullanım şartı sayfası yok",
    ),
    Source(
        key="karacadag",
        name="Karacadağ Kalkınma Ajansı",
        url="https://www.karacadag.gov.tr/",
        robots="izin: User-agent * boş (sitemap var)",
        terms="şart sayfası bulunamadı",
        status="disabled",
        reason="belirsiz: şart sayfası yok",
    ),
    Source(
        key="worldbank",
        name="Dünya Bankası (Türkiye projeleri)",
        url="https://projects.worldbank.org/",
        robots="izin: Allow:* ; /apps/, /misc*, /conf/ vb. kapalı",
        terms="Terms of Use bağlantısı 404 (URL doğrulanamadı); API uç noktası çalışıyor",
        status="disabled",
        reason="belirsiz: şart sayfası doğrulanamadı (kod yazılmadı)",
    ),
)


def open_sources() -> tuple[Source, ...]:
    return tuple(s for s in SOURCES if s.status == "open")


def get(key: str) -> Source:
    for s in SOURCES:
        if s.key == key:
            return s
    raise KeyError(key)
