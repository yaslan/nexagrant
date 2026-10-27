"""Komut satırından çağrı özeti: python cagri_ozet.py belge1.pdf belge2.docx -o ozet.md

Bağlantı da verilebilir: python cagri_ozet.py https://... -o ozet.md
Anahtar ortam değişkeninden ya da bu klasördeki .env dosyasından okunur.
"""

import argparse
import os
import sys
from pathlib import Path

from cagri_ozet_modulu.cekirdek import (
    OzetHatasi,
    belgeleri_birlestir,
    dosya_al,
    ozet_uret,
    url_al,
)


def env_yukle(yol: Path = Path(__file__).with_name(".env")) -> None:
    """KEY=VALUE satırlarını ortama ekler; ortamda zaten tanımlı değerleri ezmez."""
    if not yol.exists():
        return
    for satir in yol.read_text(encoding="utf-8").splitlines():
        satir = satir.strip()
        if not satir or satir.startswith("#") or "=" not in satir:
            continue
        anahtar, deger = satir.split("=", 1)
        os.environ.setdefault(anahtar.strip(), deger.strip().strip('"').strip("'"))


def main() -> None:
    arac = argparse.ArgumentParser(description="Proje çağrısı özeti üretir.")
    arac.add_argument("kaynaklar", nargs="+", help="dosya yolu ya da http(s) bağlantısı")
    arac.add_argument("-o", "--cikti", type=Path, default=Path("ozet.md"))
    args = arac.parse_args()

    env_yukle()
    try:
        parcalar = [url_al(k) if k.startswith(("http://", "https://")) else dosya_al(Path(k)) for k in args.kaynaklar]
        ozet = ozet_uret(belgeleri_birlestir(parcalar), [ad for ad, _ in parcalar])
    except OzetHatasi as hata:
        sys.exit(str(hata))
    args.cikti.write_text(ozet, encoding="utf-8")
    print(f"Özet yazıldı: {args.cikti}")


if __name__ == "__main__":
    main()
