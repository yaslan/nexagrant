"""Örnek ana site: çağrı özeti modülünü bir Flask sitesine bağlar.

Çalıştırma:
    .venv/bin/python ornek_site.py
    Tarayıcıda http://127.0.0.1:5000/ozet/ adresini aç.

Gerçek sitede modülü kendi uygulamanıza şöyle ekleyin:
    app.register_blueprint(ozet_blueprint(url_prefix="/ozet"))
Kimlik doğrulama ve CSRF korumasını ana uygulama sağlamalıdır; modül sağlamaz.
"""

import os
from pathlib import Path

from flask import Flask, render_template_string

from cagri_ozet_modulu import ozet_blueprint

ANA_SAYFA = """<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Örnek Site</title></head>
<body style="margin:0;font-family:system-ui,sans-serif;background:#f6f7f9">
<header style="padding:16px;background:#1d2330;color:#fff">Örnek Site</header>
<main style="padding:16px">{{ icerik|safe }}</main>
</body></html>"""


def _env_yukle(yol: Path) -> None:
    if not yol.exists():
        return
    for satir in yol.read_text(encoding="utf-8").splitlines():
        if "=" in satir and not satir.lstrip().startswith("#"):
            anahtar, deger = satir.split("=", 1)
            os.environ.setdefault(anahtar.strip(), deger.strip())


def create_app() -> Flask:
    _env_yukle(Path(__file__).with_name(".env"))
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024  # birden çok dosya için toplam sınır
    app.register_blueprint(ozet_blueprint(url_prefix="/ozet"))

    @app.get("/")
    def ana_sayfa():
        return render_template_string(ANA_SAYFA, icerik="<p>Çağrı özeti için <a href='/ozet/'>/ozet</a> sayfasına gidin.</p>")

    return app


if __name__ == "__main__":
    create_app().run(host="127.0.0.1", port=5000, debug=False)
