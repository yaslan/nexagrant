import sqlite3
import pandas as pd
from pathlib import Path
from datetime import datetime
from typing import Optional, Union, List, Dict, Any
import config


def get_experts_export_df(
    conn: sqlite3.Connection,
    status: Optional[str] = None,
    segment: Optional[str] = None,
    user_id: Optional[int] = None,
    role: str = config.ROLE_YONETICI
) -> pd.DataFrame:
    """Fetch experts and assignments for export to Excel or CSV."""
    query = """
        SELECT e.id as "ID",
               e.ad as "Ad",
               e.soyad as "Soyad",
               e.uzmanlik as "Uzmanlık",
               e.ulus as "Ulus",
               e.dil as "Dil",
               e.durum as "Durum",
               e.opt_out as "Opt Out",
               e.son_gonderim_tarihi as "Son Gönderim Tarihi",
               u.ad_soyad as "Atanan Üye",
               u.eposta as "Atanan Üye E-posta",
               e.created_at as "Kayıt Tarihi"
        FROM experts e
        LEFT JOIN assignments a ON e.id = a.expert_id
        LEFT JOIN users u ON a.user_id = u.id
        WHERE 1=1
    """
    params: List[Any] = []
    
    if status:
        query += " AND e.durum = ?"
        params.append(status)
        
    if segment:
        query += " AND e.uzmanlik LIKE ?"
        params.append(f"%{segment}%")
        
    if role == config.ROLE_UYE and user_id is not None:
        query += " AND a.user_id = ?"
        params.append(user_id)
        
    query += " ORDER BY e.id ASC"
    
    return pd.read_sql_query(query, conn, params=params)


def export_to_csv(
    conn: sqlite3.Connection,
    output_path: Optional[Path] = None,
    status: Optional[str] = None,
    segment: Optional[str] = None
) -> Path:
    """Export current status to CSV file."""
    path = output_path or (config.OUTPUT_DIR / f"uzmanlar_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv")
    path.parent.mkdir(parents=True, exist_ok=True)
    df = get_experts_export_df(conn, status=status, segment=segment)
    df.to_csv(path, index=False, encoding="utf-8-sig")
    return path


def export_to_excel(
    conn: sqlite3.Connection,
    output_path: Optional[Path] = None,
    status: Optional[str] = None,
    segment: Optional[str] = None
) -> Path:
    """Export current status to Excel (.xlsx) file."""
    path = output_path or (config.OUTPUT_DIR / f"uzmanlar_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx")
    path.parent.mkdir(parents=True, exist_ok=True)
    df = get_experts_export_df(conn, status=status, segment=segment)
    df.to_excel(path, index=False)
    return path


def create_database_backup(
    db_path: Optional[Union[str, Path]] = None,
    backup_dir: Optional[Path] = None
) -> Path:
    """
    Safely create an online SQLite backup using SQLite's native backup API.
    """
    source_path = Path(db_path or config.DB_PATH)
    target_dir = backup_dir or config.BACKUP_DIR
    target_dir.mkdir(parents=True, exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = target_dir / f"fonbridge_backup_{timestamp}.db"
    
    # Open source and backup connections
    src_conn = sqlite3.connect(source_path)
    bck_conn = sqlite3.connect(backup_file)
    with bck_conn:
        src_conn.backup(bck_conn)
        
    bck_conn.close()
    src_conn.close()
    
    return backup_file


def list_backups(backup_dir: Optional[Path] = None) -> List[Dict[str, Any]]:
    """List available database backup files with size and creation dates."""
    target_dir = backup_dir or config.BACKUP_DIR
    if not target_dir.exists():
        return []
    
    files = sorted(target_dir.glob("*.db"), key=lambda p: p.stat().st_mtime, reverse=True)
    backups = []
    for f in files:
        stat = f.stat()
        backups.append({
            "filename": f.name,
            "path": str(f),
            "size_kb": round(stat.st_size / 1024, 2),
            "date": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
        })
    return backups
