import pytest
from pathlib import Path
from src.db import init_db
from src.exporter import export_to_csv, export_to_excel, create_database_backup, list_backups

@pytest.fixture
def test_db(tmp_path):
    db_file = tmp_path / "test.db"
    conn = init_db(db_file)
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO experts (ad, soyad, uzmanlik, dil, durum, opt_out)
        VALUES ('Ali', 'Can', 'Finans', 'TR', 'Bekliyor', 0)
        """
    )
    conn.commit()
    yield conn, db_file
    conn.close()

def test_export_csv_and_excel(test_db, tmp_path):
    conn, db_file = test_db
    csv_file = tmp_path / "export.csv"
    excel_file = tmp_path / "export.xlsx"

    out_csv = export_to_csv(conn, csv_file)
    assert out_csv.exists()
    assert out_csv.stat().st_size > 0

    out_excel = export_to_excel(conn, excel_file)
    assert out_excel.exists()
    assert out_excel.stat().st_size > 0

def test_database_backup(test_db, tmp_path):
    conn, db_file = test_db
    backup_dir = tmp_path / "backups"
    
    bck = create_database_backup(db_file, backup_dir)
    assert bck.exists()
    assert bck.stat().st_size > 0

    backups = list_backups(backup_dir)
    assert len(backups) == 1
    assert backups[0]["filename"] == bck.name
