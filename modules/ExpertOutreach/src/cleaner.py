import re
import pandas as pd
from typing import Dict, Any, List, Tuple, Optional
from pathlib import Path
import config

COLUMN_MAP_CANDIDATES = {
    "first_name": ["first name", "firstname", "first_name", "ad", "adı", "isim", "name", "forename", "first"],
    "last_name": ["last name", "lastname", "last_name", "soyad", "soyadı", "surname", "family name", "family_name", "last"],
    "full_name": ["ad soyad", "adı soyadı", "full name", "fullname", "ad_soyad", "isim soyisim", "name surname", "ad-soyad"],
    "expertise": [
        "area of expertise", "area_of_expertise", "expertise", "uzmanlık", "uzmanlik",
        "uzmanlık alanı", "uzmanlik alani", "alan", "sektör", "sektor", "field",
        "branch", "branş", "specialization", "expert area", "discipline", "konu", "çalışma alanı"
    ]
}


def find_column_mapping(columns: List[str]) -> Dict[str, str]:
    """Find matching columns from file headers regardless of case or whitespace."""
    mapping = {}
    normalized_cols = {col.strip().lower(): col for col in columns}
    
    for key, candidates in COLUMN_MAP_CANDIDATES.items():
        matched = None
        for candidate in candidates:
            if candidate in normalized_cols:
                matched = normalized_cols[candidate]
                break
        if matched:
            mapping[key] = matched
            
    return mapping


def clean_str(val: Any) -> str:
    """Safely convert value to trimmed string, handling None and NaN."""
    if val is None or pd.isna(val):
        return ""
    text = str(val).strip()
    # Normalize multiple whitespace
    return re.sub(r"\s+", " ", text)


def parse_expertise_segments(expertise_str: str) -> List[str]:
    """
    Split expertise by '//' as specified in proje.md,
    strip each segment, and remove empties.
    Example: 'Finans // Hukuk' -> ['Finans', 'Hukuk']
    """
    if not expertise_str:
        return []
    parts = expertise_str.split("//")
    cleaned = [clean_str(p) for p in parts]
    return [p for p in cleaned if p]


def clean_and_validate_records(
    df: pd.DataFrame,
    existing_keys: Optional[set] = None,
    custom_mapping: Optional[Dict[str, str]] = None
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], int]:
    """
    Clean and validate dataframe rows.
    Supports separate First/Last name or combined Full Name column.
    
    Returns:
    - valid_records: List of valid expert dicts ready for insertion
    - error_records: List of error dicts for error report
    - empty_count: Count of fully empty rows skipped
    """
    mapping = custom_mapping if custom_mapping else find_column_mapping(list(df.columns))
    
    first_col = mapping.get("first_name")
    last_col = mapping.get("last_name")
    full_name_col = mapping.get("full_name")
    exp_col = mapping.get("expertise")
    
    if not exp_col or (not (first_col and last_col) and not full_name_col):
        raise ValueError(
            f"Zorunlu kolonlar bulunamadı! Mevcut kolonlar: {list(df.columns)}. "
            f"Gereken kolonlar: 'First Name', 'Last Name' (veya 'Ad Soyad'), 'Area of expertise'"
        )

    valid_records: List[Dict[str, Any]] = []
    error_records: List[Dict[str, Any]] = []
    empty_count = 0
    
    seen_in_batch = set()
    db_existing = existing_keys if existing_keys is not None else set()

    for idx, row in df.iterrows():
        row_num = idx + 2  # 1-indexed Excel row (header is 1)
        
        if first_col and last_col:
            ad = clean_str(row.get(first_col))
            soyad = clean_str(row.get(last_col))
        elif full_name_col:
            full_name = clean_str(row.get(full_name_col))
            if " " in full_name:
                parts = full_name.rsplit(" ", 1)
                ad = parts[0].strip()
                soyad = parts[1].strip()
            else:
                ad = full_name
                soyad = ""
        else:
            ad = ""
            soyad = ""

        uzmanlik = clean_str(row.get(exp_col))

        # 1. Skip completely empty rows
        if not ad and not soyad and not uzmanlik:
            empty_count += 1
            continue

        # 2. Check missing mandatory fields
        missing_fields = []
        if not ad:
            missing_fields.append("First Name (Ad)")
        if not soyad:
            missing_fields.append("Last Name (Soyad)")
        if not uzmanlik:
            missing_fields.append("Area of expertise (Uzmanlık)")

        if missing_fields:
            error_records.append({
                "Satır No": row_num,
                "Ad": ad,
                "Soyad": soyad,
                "Uzmanlık": uzmanlik,
                "Hata Nedeni": f"Eksik zorunlu alan: {', '.join(missing_fields)}"
            })
            continue

        # 3. Check duplicate (Ad + Soyad + Uzmanlik)
        dedup_key = (ad.lower(), soyad.lower(), uzmanlik.lower())

        if dedup_key in seen_in_batch:
            error_records.append({
                "Satır No": row_num,
                "Ad": ad,
                "Soyad": soyad,
                "Uzmanlık": uzmanlik,
                "Hata Nedeni": "Tekrar kaydı (Dosya içinde mükerrer)"
            })
            continue

        if dedup_key in db_existing:
            error_records.append({
                "Satır No": row_num,
                "Ad": ad,
                "Soyad": soyad,
                "Uzmanlık": uzmanlik,
                "Hata Nedeni": "Tekrar kaydı (Veritabanında zaten mevcut)"
            })
            continue

        seen_in_batch.add(dedup_key)
        valid_records.append({
            "ad": ad,
            "soyad": soyad,
            "uzmanlik": uzmanlik,
            "segments": parse_expertise_segments(uzmanlik)
        })

    return valid_records, error_records, empty_count


def write_error_report(error_records: List[Dict[str, Any]], output_path: Optional[Path] = None) -> Optional[Path]:
    """Write invalid/duplicate records to output/hata_raporu.csv."""
    if not error_records:
        return None
    
    path = output_path or config.ERROR_REPORT_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    
    report_df = pd.DataFrame(error_records)
    report_df.to_csv(path, index=False, encoding="utf-8-sig")
    return path
