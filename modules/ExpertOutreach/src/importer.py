import sqlite3
import pandas as pd
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Union, Optional, Tuple, BinaryIO
from src.cleaner import (
    find_column_mapping,
    clean_and_validate_records,
    write_error_report,
)
from src.language import detect_language, detect_nationality_and_language
import config


def read_file_to_df(file_source: Union[str, Path, BinaryIO]) -> pd.DataFrame:
    """Read CSV or Excel file into a pandas DataFrame."""
    if isinstance(file_source, (str, Path)):
        path = Path(file_source)
        ext = path.suffix.lower()
        if ext in [".xlsx", ".xls"]:
            return pd.read_excel(path, dtype=str)
        elif ext == ".csv":
            # Attempt utf-8, fallback to latin-1
            try:
                return pd.read_csv(path, dtype=str, encoding="utf-8")
            except UnicodeDecodeError:
                return pd.read_csv(path, dtype=str, encoding="latin-1")
        else:
            raise ValueError(f"Desteklenmeyen dosya formatı: {ext}. Yalnızca .xlsx ve .csv desteklenir.")
    else:
        # File buffer (e.g. Streamlit UploadedFile)
        # Try excel first, if fails try csv
        try:
            return pd.read_excel(file_source, dtype=str)
        except Exception:
            file_source.seek(0)
            try:
                return pd.read_csv(file_source, dtype=str, encoding="utf-8")
            except Exception:
                file_source.seek(0)
                return pd.read_csv(file_source, dtype=str, encoding="latin-1")


def preview_file(file_source: Union[str, Path, BinaryIO], num_rows: int = 10) -> Dict[str, Any]:
    """Preview first N rows of file and detect column mapping."""
    df = read_file_to_df(file_source)
    columns = list(df.columns)
    mapping = find_column_mapping(columns)
    preview_rows = df.head(num_rows).fillna("").to_dict(orient="records")
    has_names = ("first_name" in mapping and "last_name" in mapping) or ("full_name" in mapping)
    has_exp = "expertise" in mapping
    return {
        "total_rows": len(df),
        "columns": columns,
        "mapping": mapping,
        "is_valid_columns": bool(has_names and has_exp),
        "preview_data": preview_rows
    }


def import_experts_from_file(
    file_source: Union[str, Path, BinaryIO],
    conn: sqlite3.Connection,
    user_id: Optional[int] = None,
    custom_mapping: Optional[Dict[str, str]] = None
) -> Dict[str, Any]:
    """
    Import experts from Excel or CSV file.
    
    1. Reads file into DataFrame.
    2. Fetches existing keys from DB for deduplication.
    3. Cleans, validates, detects duplicates and missing fields.
    4. Automatically detects language (TR, EN, DE) per expert.
    5. Inserts new segments into segments table.
    6. Efficiently bulk-inserts valid experts using executemany.
    7. Writes error report to output/hata_raporu.csv if any errors occurred.
    8. Records import event if user_id is provided.
    
    Returns a comprehensive result summary.
    """
    start_time = datetime.now()
    df = read_file_to_df(file_source)
    total_file_rows = len(df)

    # 1. Fetch existing experts for deduplication
    cursor = conn.cursor()
    cursor.execute("SELECT lower(ad), lower(soyad), lower(uzmanlik) FROM experts")
    existing_keys = {(r[0], r[1], r[2]) for r in cursor.fetchall()}

    # 2. Clean, validate and deduplicate
    valid_records, error_records, empty_count = clean_and_validate_records(
        df,
        existing_keys=existing_keys,
        custom_mapping=custom_mapping
    )

    # 3. Collect unique segments & prepare bulk insert records
    now_iso = datetime.now().isoformat()
    all_segments = set()
    insert_rows = []

    for item in valid_records:
        ad = item["ad"]
        soyad = item["soyad"]
        uzmanlik = item["uzmanlik"]
        segments = item["segments"]
        all_segments.update(segments)

        ulus, lang = detect_nationality_and_language(ad, soyad, context_text=uzmanlik)

        insert_rows.append((
            ad,
            soyad,
            uzmanlik,
            ulus,
            lang,
            config.STATUS_BEKLIYOR,
            0,     # opt_out
            None,  # son_gonderim_tarihi
            now_iso,
            now_iso
        ))

    # 4. Insert segments & experts in single atomic transaction
    with conn:
        if all_segments:
            conn.executemany(
                "INSERT OR IGNORE INTO segments (ad) VALUES (?)",
                [(seg,) for seg in all_segments if seg]
            )

        if insert_rows:
            conn.executemany(
                """
                INSERT INTO experts (
                    ad, soyad, uzmanlik, ulus, dil, durum, opt_out,
                    son_gonderim_tarihi, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                insert_rows
            )

        # 5. Log contact event if user_id is given
        if user_id and insert_rows:
            conn.execute(
                """
                INSERT INTO contact_events (expert_id, user_id, tip, not_metni, tarih)
                VALUES (NULL, ?, 'dosya_ice_aktarildi', ?, ?)
                """,
                (
                    user_id,
                    f"{len(insert_rows)} uzman başarıyla içe aktarıldı.",
                    now_iso
                )
            )

    # 6. Write error report if there are any error records
    error_report_file = write_error_report(error_records)

    elapsed_seconds = (datetime.now() - start_time).total_seconds()

    return {
        "total_file_rows": total_file_rows,
        "empty_rows_skipped": empty_count,
        "valid_imported_count": len(insert_rows),
        "error_count": len(error_records),
        "new_segments_count": len(all_segments),
        "error_report_path": str(error_report_file) if error_report_file else None,
        "elapsed_seconds": round(elapsed_seconds, 3)
    }
