import pytest
import sqlite3
from src.db import init_db
from src.language import (
    detect_nationality_and_language,
    detect_language,
    re_evaluate_all_expert_languages
)


def test_eu_languages_detection():
    test_cases = [
        ("Ahmet", "Yılmaz", "", "Türkiye", "TR"),
        ("Niko", "Beerenwinkel", "Zurich", "Almanya / Avusturya / İsviçre", "DE"),
        ("Gaelle", "Legube", "", "Fransa / Belçika", "FR"),
        ("Marco", "Rossi", "", "İtalya", "IT"),
        ("Carlos", "Rodriguez", "", "İspanya", "ES"),
        ("Jan", "van der Berg", "", "Hollanda / Belçika", "NL"),
        ("Piotr", "Kowalski", "", "Polonya", "PL"),
        ("João", "Silva", "", "Portekiz", "PT"),
        ("Andrei", "Popescu", "", "Romanya", "RO"),
        ("Nikolaos", "Papadopoulos", "", "Yunanistan / Kıbrıs", "EL"),
        ("Jiří", "Novák", "", "Çekya", "CS"),
        ("Jozef", "Kováč", "", "Slovakya", "SK"),
        ("László", "Szabó", "", "Macaristan", "HU"),
        ("Lars", "Andersson", "", "İsveç", "SV"),
        ("Mikkel", "Jensen", "", "Danimarka", "DA"),
        ("Matti", "Virtanen", "", "Finlandiya", "FI"),
        ("Ivan", "Horvat", "", "Hırvatistan", "HR"),
        ("Georgi", "Dimitrov", "", "Bulgaristan", "BG"),
        ("Matic", "Zupan", "", "Slovenya", "SL"),
        ("Jonas", "Kazlauskas", "", "Litvanya", "LT"),
        ("Jānis", "Bērziņš", "", "Letonya", "LV"),
        ("Mart", "Tamm", "", "Estonya", "ET"),
        ("Seán", "O'Connor", "", "İrlanda", "GA"),
        ("Joseph", "Camilleri", "", "Malta", "MT"),
        ("John", "Smith", "", "İngiltere / Uluslararası", "EN"),
    ]

    for first_name, last_name, context, expected_nat, expected_lang in test_cases:
        nat, lang = detect_nationality_and_language(first_name, last_name, context)
        assert lang == expected_lang, f"Failed for {first_name} {last_name}: expected {expected_lang}, got {lang}"
        assert nat == expected_nat, f"Failed for {first_name} {last_name}: expected {expected_nat}, got {nat}"


def test_re_evaluate_all_expert_languages():
    conn = init_db(":memory:")
    # Insert multiple experts from different EU countries
    experts_data = [
        ("Ahmet", "Yılmaz", "Finans"),
        ("Gaelle", "Legube", "Biyoloji"),
        ("Niko", "Beerenwinkel", "Biyoinformatik - Zürih"),
        ("Marco", "Rossi", "Mühendislik"),
        ("Carlos", "García", "Yapay Zeka"),
        ("Jan", "van Dijk", "Tarım"),
        ("Piotr", "Nowak", "Fizik"),
        ("Matti", "Virtanen", "Orman"),
        ("Lars", "Andersson", "Robotik"),
        ("Mikkel", "Nielsen", "Denizcilik"),
        ("John", "Smith", "Ekonomi"),
    ]
    with conn:
        conn.executemany(
            "INSERT INTO experts (ad, soyad, uzmanlik) VALUES (?, ?, ?)",
            experts_data
        )

    res = re_evaluate_all_expert_languages(conn)
    assert res["total"] == 11
    langs = res["languages"]

    assert langs.get("TR") == 1
    assert langs.get("FR") == 1
    assert langs.get("DE") == 1
    assert langs.get("IT") == 1
    assert langs.get("ES") == 1
    assert langs.get("NL") == 1
    assert langs.get("PL") == 1
    assert langs.get("FI") == 1
    assert langs.get("SV") == 1
    assert langs.get("DA") == 1
    assert langs.get("EN") == 1
