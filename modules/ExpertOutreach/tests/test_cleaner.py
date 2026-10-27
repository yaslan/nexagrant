import pandas as pd
import pytest
from src.cleaner import (
    find_column_mapping,
    clean_str,
    parse_expertise_segments,
    clean_and_validate_records,
    write_error_report
)


def test_find_column_mapping():
    cols = ["  FIRST NAME ", "Last_Name", "Area of Expertise  ", "Extra Col"]
    mapping = find_column_mapping(cols)
    assert mapping["first_name"] == "  FIRST NAME "
    assert mapping["last_name"] == "Last_Name"
    assert mapping["expertise"] == "Area of Expertise  "


def test_clean_str():
    assert clean_str("  Ahmet   Yılmaz  ") == "Ahmet Yılmaz"
    assert clean_str(None) == ""
    assert clean_str(float("nan")) == ""


def test_parse_expertise_segments():
    res = parse_expertise_segments("Finans // Hukuk //  Yapay Zeka // ")
    assert res == ["Finans", "Hukuk", "Yapay Zeka"]


def test_clean_and_validate_records(tmp_path):
    df = pd.DataFrame([
        {"First Name": " Ali ", "Last Name": " Can ", "Area of expertise": "Finans"},
        {"First Name": "", "Last Name": "", "Area of expertise": ""}, # Empty
        {"First Name": "Veli", "Last Name": "", "Area of expertise": "Teknoloji"}, # Incomplete
        {"First Name": " Ali ", "Last Name": " Can ", "Area of expertise": "Finans"}, # Duplicate
    ])
    
    valid, errors, empty = clean_and_validate_records(df)
    assert empty == 1
    assert len(valid) == 1
    assert valid[0]["ad"] == "Ali"
    assert valid[0]["soyad"] == "Can"
    assert len(errors) == 2
    
    # Write error report
    report_file = tmp_path / "hata.csv"
    out = write_error_report(errors, report_file)
    assert out.exists()
    report_df = pd.read_csv(out)
    assert len(report_df) == 2
