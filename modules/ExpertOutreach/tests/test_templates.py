import pytest
from src.db import init_db
from src.templates import (
    validate_template_body,
    render_message,
    get_active_template,
    save_template,
)


@pytest.fixture
def test_db():
    conn = init_db(":memory:")
    yield conn
    conn.close()


def test_validate_template_body():
    # Valid templates containing at least one variable
    assert validate_template_body("Merhaba {ad}, nasılsınız?") is True
    assert validate_template_body("Sayın {soyad}") is True
    assert validate_template_body("Alanınız: {uzmanlik}") is True

    # Invalid templates without personal variables
    assert validate_template_body("Merhaba, platformumuzu tanıtmak istiyoruz.") is False
    assert validate_template_body("") is False


def test_render_message():
    template = "Merhaba {ad} {soyad}, {uzmanlik} alanındaki çalışmalarınız harika."
    expert = {
        "ad": "Ahmet",
        "soyad": "Yılmaz",
        "uzmanlik": "Finans"
    }
    rendered = render_message(template, expert)
    assert rendered == "Merhaba Ahmet Yılmaz, Finans alanındaki çalışmalarınız harika."


def test_get_active_template_languages(test_db):
    # Test default templates seeded on init for all 24 EU languages + TR
    expected_langs = [
        "TR", "EN", "DE", "FR", "IT", "ES", "NL", "PL", "PT", "RO",
        "EL", "CS", "HU", "SV", "DA", "FI", "SK", "HR", "BG", "SL",
        "LT", "LV", "ET", "GA", "MT"
    ]
    for lang in expected_langs:
        tpl = get_active_template(test_db, dil=lang)
        assert tpl is not None, f"Template for {lang} should be seeded!"
        assert "{ad}" in tpl["govde"], f"Template for {lang} should contain {{ad}}"
        assert "{uzmanlik}" in tpl["govde"], f"Template for {lang} should contain {{uzmanlik}}"
        assert tpl["dil"] == lang


def test_segment_specific_template_fallback(test_db):
    # Save a segment-specific template for 'Finans'
    save_template(
        test_db,
        dil="TR",
        govde="Özel Finans Mesajı {ad}",
        konu="Finans Özel",
        segment="Finans"
    )

    # For 'Finans', should return segment-specific
    t_finans = get_active_template(test_db, segment="Finans", dil="TR")
    assert t_finans["govde"] == "Özel Finans Mesajı {ad}"

    # For 'Hukuk', should fall back to general default TR template
    t_hukuk = get_active_template(test_db, segment="Hukuk", dil="TR")
    assert "Merhaba {ad}" in t_hukuk["govde"]
