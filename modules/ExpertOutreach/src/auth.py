import bcrypt
from typing import Optional, Dict, Any, List
import sqlite3

def hash_password(password: str) -> str:
    """Hash password using bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def verify_password(password: str, hashed_password: str) -> bool:
    """Verify password against bcrypt hash."""
    if not password or not hashed_password:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False

def authenticate_user(conn: sqlite3.Connection, eposta: str, parola: str) -> Optional[Dict[str, Any]]:
    """Authenticate user with email and password."""
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, ad_soyad, eposta, rol, parola_hash, aktif, gunluk_limit, paket, moduller
        FROM users WHERE eposta = ? AND aktif = 1
        """,
        (eposta.strip().lower(),)
    )
    row = cursor.fetchone()
    if not row:
        return None
    
    user = {
        "id": row[0],
        "ad_soyad": row[1],
        "eposta": row[2],
        "rol": row[3],
        "parola_hash": row[4],
        "aktif": row[5],
        "gunluk_limit": row[6],
        "paket": row[7] if len(row) > 7 and row[7] else "Standart",
        "moduller": row[8] if len(row) > 8 and row[8] else ""
    }
    
    if verify_password(parola, user["parola_hash"]):
        return user
    return None

def create_user(
    conn: sqlite3.Connection,
    ad_soyad: str,
    eposta: str,
    parola: str,
    rol: str = "uye",
    gunluk_limit: Optional[int] = None,
    paket: str = "Standart",
    moduller: str = ""
) -> int:
    """Create a new user with hashed password and subscription plan."""
    parola_hash = hash_password(parola)
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO users (ad_soyad, eposta, rol, parola_hash, aktif, gunluk_limit, paket, moduller)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?)
        """,
        (ad_soyad.strip(), eposta.strip().lower(), rol, parola_hash, gunluk_limit, paket, moduller)
    )
    conn.commit()
    return cursor.lastrowid

def get_all_users(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    """Retrieve all users with subscription plan and granted modules."""
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, ad_soyad, eposta, rol, aktif, gunluk_limit, paket, moduller
        FROM users ORDER BY id ASC
        """
    )
    users = []
    for r in cursor.fetchall():
        users.append({
            "id": r[0],
            "ad_soyad": r[1],
            "eposta": r[2],
            "rol": r[3],
            "aktif": r[4],
            "gunluk_limit": r[5],
            "paket": r[6] if len(r) > 6 and r[6] else "Standart",
            "moduller": r[7] if len(r) > 7 and r[7] else ""
        })
    return users
