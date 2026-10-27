"""Çağrı özeti Flask modülü.

Mevcut bir Flask sitesine şöyle eklenir:

    from cagri_ozet_modulu import ozet_blueprint

    app.register_blueprint(ozet_blueprint(url_prefix="/ozet"))

Sayfa bir parça (fragment) olarak üretilir ve sitenin kendi düzenine yerleşir.
Stiller `.co-ozet` altında kapsanır, sitenin stilleriyle çakışmaz.
Kimlik doğrulama ve CSRF korumasını barındıran site sağlamalıdır.
"""

import html

import markdown
from flask import Blueprint, render_template_string, request

from .cekirdek import (
    MAX_DOSYA_BAYT,
    OzetHatasi,
    belgeleri_birlestir,
    metin_cikar,
    ozet_uret,
    url_al,
)

__all__ = ["ozet_blueprint", "OzetHatasi"]

STIL = """
<style>
  .co-ozet { --bg:#f6f7f9; --kart:#fff; --metin:#1d2330; --soluk:#5b6372; --vurgu:#1f5fbf; --hata:#b42318; --cizgi:#dfe3ea;
    color:var(--metin); font:16px/1.6 system-ui, sans-serif; max-width:820px; margin:0 auto; }
  @media (prefers-color-scheme: dark) {
    .co-ozet { --bg:#14171d; --kart:#1c2129; --metin:#e6e9ef; --soluk:#9aa3b2; --vurgu:#7fb0ff; --hata:#ff8a80; --cizgi:#2c333e; }
  }
  .co-ozet h1 { font-size:1.6rem; margin:0 0 4px; }
  .co-ozet .alt { color:var(--soluk); margin:0 0 24px; }
  .co-ozet .kart { background:var(--kart); border:1px solid var(--cizgi); border-radius:12px; padding:20px; margin-bottom:20px; }
  .co-ozet label { display:block; font-weight:600; margin:12px 0 6px; }
  .co-ozet textarea, .co-ozet input[type=file] { width:100%; box-sizing:border-box; font:inherit; color:var(--metin); }
  .co-ozet textarea { min-height:90px; padding:10px; border:1px solid var(--cizgi); border-radius:8px; background:var(--bg); }
  .co-ozet .ipucu { color:var(--soluk); font-size:.9rem; margin:6px 0 0; }
  .co-ozet button { margin-top:18px; background:var(--vurgu); color:#fff; border:0; border-radius:8px; padding:11px 18px; font:inherit; font-weight:600; cursor:pointer; }
  .co-ozet button:disabled { opacity:.6; cursor:progress; }
  .co-ozet .hata { color:var(--hata); }
  .co-ozet .ozet table { width:100%; border-collapse:collapse; margin:12px 0; }
  .co-ozet .ozet th, .co-ozet .ozet td { border:1px solid var(--cizgi); padding:8px; text-align:left; vertical-align:top; }
  .co-ozet .ozet h2 { font-size:1.15rem; border-bottom:1px solid var(--cizgi); padding-bottom:4px; margin-top:24px; }
  .co-ozet .ust { display:flex; gap:12px; flex-wrap:wrap; align-items:center; justify-content:space-between; }
  .co-ozet a.geri { color:var(--vurgu); text-decoration:none; font-weight:600; }
  @media print { .co-ozet button, .co-ozet a.geri { display:none; } .co-ozet .kart { border:0; } }
</style>
"""

FORM = """<div class="co-ozet">
<h1>Çağrı Özeti</h1>
<p class="alt">Bağlantı ya da dosya ekleyin; belgelerden Türkçe özet hazırlanır.</p>
{% if hata %}<div class="kart hata">{{ hata }}</div>{% endif %}
<form class="kart" method="post" action="{{ url_for('.gonder') }}" enctype="multipart/form-data"
      onsubmit="var b=this.querySelector('button'); b.disabled=true; b.textContent='Hazırlanıyor…';">
  <label for="co-baglantilar">Bağlantılar</label>
  <textarea id="co-baglantilar" name="baglantilar" placeholder="https://www.ktu.edu.tr/..."></textarea>
  <p class="ipucu">Her satıra bir bağlantı. Bağlantı PDF, DOCX veya HTML sayfası olabilir.</p>

  <label for="co-dosyalar">Dosyalar</label>
  <input id="co-dosyalar" type="file" name="dosyalar" multiple accept=".pdf,.docx,.html,.htm,.txt,.md">
  <p class="ipucu">PDF, DOCX, HTML, TXT veya MD. Dosya başına en fazla 25 MB.</p>

  <button type="submit">Özet oluştur</button>
</form>
</div>"""

SONUC = """<div class="co-ozet">
<div class="ust">
  <h1>Çağrı Özeti</h1>
  <button onclick="window.print()">Yazdır / PDF</button>
</div>
<p class="alt">Kaynaklar: {{ kaynaklar|join(", ") }}</p>
{% if sorunlar %}
<div class="kart hata">
  <strong>Bazı kaynaklar işlenemedi:</strong>
  <ul>{% for s in sorunlar %}<li>{{ s }}</li>{% endfor %}</ul>
</div>
{% endif %}
<div class="kart ozet">{{ ozet_html|safe }}</div>
<p><a class="geri" href="{{ url_for('.giris') }}">Yeni özet</a></p>
</div>"""


def _sayfa(govde: str, **baglam) -> str:
    return render_template_string(STIL + govde, **baglam)


def ozet_blueprint(url_prefix: str = "/ozet", api_key: str | None = None) -> Blueprint:
    """Çağrı özeti sayfalarını içeren bir Flask Blueprint döndürür.

    url_prefix: modülün sitede bulunacağı yol.
    api_key: Anthropic anahtarı. Verilmezse ANTHROPIC_API_KEY ortam değişkeni kullanılır.
    """
    bp = Blueprint("cagri_ozet", __name__, url_prefix=url_prefix)

    @bp.get("/")
    def giris():
        return _sayfa(FORM, hata=None)

    @bp.post("/gonder")
    def gonder():
        parcalar: list[tuple[str, str]] = []
        sorunlar: list[str] = []

        for satir in request.form.get("baglantilar", "").splitlines():
            baglanti = satir.strip()
            if not baglanti:
                continue
            try:
                parcalar.append(url_al(baglanti))
            except Exception as hata:  # ağ ve ayrıştırma hataları kullanıcıya gösterilir
                sorunlar.append(f"{baglanti}: {hata}")

        for dosya in request.files.getlist("dosyalar"):
            if not dosya.filename:
                continue
            veri = dosya.read(MAX_DOSYA_BAYT + 1)
            try:
                if len(veri) > MAX_DOSYA_BAYT:
                    raise OzetHatasi("dosya 25 MB sınırını aşıyor")
                parcalar.append((dosya.filename, metin_cikar(dosya.filename, veri, dosya.mimetype or "")))
            except Exception as hata:
                sorunlar.append(f"{dosya.filename}: {hata}")

        if not parcalar:
            hata = "Özet için en az bir geçerli kaynak gerekli. " + " | ".join(sorunlar)
            return _sayfa(FORM, hata=hata.strip()), 400

        try:
            metin = belgeleri_birlestir(parcalar)
            ozet_metni = ozet_uret(metin, [ad for ad, _ in parcalar], api_key=api_key)
        except Exception as hata:
            return _sayfa(FORM, hata=f"Özet üretilemedi: {hata}"), 502

        ozet_html = markdown.markdown(html.escape(ozet_metni), extensions=["tables"])
        return _sayfa(SONUC, ozet_html=ozet_html, kaynaklar=[ad for ad, _ in parcalar], sorunlar=sorunlar)

    return bp
