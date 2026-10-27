import sqlite3
import pandas as pd
import pytest
from pathlib import Path
from src.db import init_db
from src.importer import preview_file, import_experts_from_file

@pytest.fixture
def test_db():
    # In-memory or temporary SQLite db
    conn = init_db(":memory:")
    yield conn
    conn.close()

@pytest.fixture
def sample_excel_file(tmp_path):
    file_path = tmp_path / "test_experts.xlsx"
    data = [
        {"First Name": "Ahmet", "Last Name": "Yılmaz", "Area of expertise": "Finans // Hukuk"},
        {"First Name": "John", "Last Name": "Doe", "Area of expertise": "Technology"},
        {"First Name": "Hans", "Last Name": "Schmidt", "Area of expertise": "Energy // Horizon Europe"},
        {"First Name": "", "Last Name": "", "Area of expertise": ""}, # Completely empty row
        {"First Name": "Ahmet", "Last Name": "Yılmaz", "Area of expertise": "Finans // Hukuk"}, # Duplicate in batch
        {"First Name": "Eksik", "Last Name": "", "Area of expertise": "Hukuk"}, # Missing last name
        {"First Name": "Zeynep", "Last Name": "Kaya", "Area of expertise": "Sağlık"},
    ]
    df = pd.DataFrame(data)
    df.to_excel(file_path, index=False)
    return file_path


def test_preview_file(sample_excel_file):
    preview = preview_file(sample_excel_file)
    assert preview["total_rows"] == 7
    assert preview["is_valid_columns"] is True
    assert "First Name" in preview["columns"]
    assert "Last Name" in preview["columns"]
    assert "Area of expertise" in preview["columns"]


def test_import_experts_success(test_db, sample_excel_file):
    result = import_experts_from_file(sample_excel_file, test_db)
    
    # 7 total rows:
    # - 1 completely empty (skipped)
    # - 1 duplicate in batch (recorded as error)
    # - 1 missing last name (recorded as error)
    # - 4 valid records (Ahmet, John, Hans, Zeynep)
    assert result["total_file_rows"] == 7
    assert result["empty_rows_skipped"] == 1
    assert result["valid_imported_count"] == 4
    assert result["error_count"] == 2

    # Check database records
    cursor = test_db.cursor()
    cursor.execute("SELECT ad, soyad, uzmanlik, dil, durum FROM experts ORDER BY id")
    rows = cursor.fetchall()
    assert len(rows) == 4
    
    # Check language detection on import
    # Ahmet -> TR
    assert rows[0][0] == "Ahmet"
    assert rows[0][3] == "TR"
    
    # John -> EN
    assert rows[1][0] == "John"
    assert rows[1][3] == "EN"
    
    # Hans -> DE
    assert rows[2][0] == "Hans"
    assert rows[2][3] == "DE"

    # Zeynep -> TR
    assert rows[3][0] == "Zeynep"
    assert rows[3][3] == "TR"

    # Check segments table
    cursor.execute("SELECT ad FROM segments ORDER BY ad")
    segments = [r[0] for r in cursor.fetchall()]
    assert "Finans" in segments
    assert "Hukuk" in segments
    assert "Technology" in segments
    assert "Energy" in segments
    assert "Horizon Europe" in segments
    assert "Sağlık" in segments


def test_deduplication_against_existing_db(test_db, sample_excel_file):
    # First import
    res1 = import_experts_from_file(sample_excel_file, test_db)
    assert res1["valid_imported_count"] == 4

    # Second import with the exact same file -> all valid items should be caught as duplicates!
    res2 = import_experts_from_file(sample_excel_file, test_db)
    assert res2["valid_imported_count"] == 0
    # The 4 previously imported items + 1 batch duplicate + 1 missing field = 6 errors
    assert res2["error_count"] == 6


def test_large_import_performance(test_db, tmp_path):
    # Benchmark criterion: 31,462 rows in under 30 seconds
    file_path = tmp_path / "large_dataset.csv"
    
    # Generate 31,462 rows in memory and write to csv
    num_rows = 31462
    lines = ["First Name,Last Name,Area of expertise\n"]
    for i in range(num_rows):
        lines.append(f"Expert{i},LastName{i},Finans // Hukuk // Teknoloji\n")
    
    file_path.write_text("".join(lines), encoding="utf-8")
    
    result = import_experts_from_file(file_path, test_db)
    assert result["valid_imported_count"] == num_rows
    assert result["elapsed_seconds"] < 30.0
    print(f"\n31,462 rows imported in: {result['elapsed_seconds']} seconds!")

