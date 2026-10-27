import sqlite3
import re
from typing import Dict, Any, List, Optional


def validate_template_body(body: str) -> bool:
    """
    Validates that the template body contains at least one personalization variable:
    {ad}, {soyad}, or {uzmanlik}.
    """
    if not body:
        return False
    return any(var in body for var in ["{ad}", "{soyad}", "{uzmanlik}"])


def render_message(template_body: str, expert: Dict[str, Any]) -> str:
    """
    Renders personalized message by replacing variables:
    {ad}, {soyad}, {uzmanlik}.
    """
    ad = str(expert.get("ad") or "").strip()
    soyad = str(expert.get("soyad") or "").strip()
    uzmanlik = str(expert.get("uzmanlik") or "").strip()
    
    rendered = template_body.replace("{ad}", ad)
    rendered = rendered.replace("{soyad}", soyad)
    rendered = rendered.replace("{uzmanlik}", uzmanlik)
    return rendered


def get_active_template(
    conn: sqlite3.Connection,
    segment: Optional[str] = None,
    dil: str = "TR"
) -> Optional[Dict[str, Any]]:
    """
    Get active template for given segment and language.
    If segment-specific template does not exist, fall back to default (segment is NULL).
    """
    cursor = conn.cursor()
    # 1. Try segment-specific
    if segment:
        cursor.execute(
            """
            SELECT id, segment, dil, konu, govde, aktif
            FROM templates
            WHERE segment = ? AND dil = ? AND aktif = 1
            LIMIT 1
            """,
            (segment, dil)
        )
        row = cursor.fetchone()
        if row:
            return dict(row)

    # 2. Fall back to default template for that language
    cursor.execute(
        """
        SELECT id, segment, dil, konu, govde, aktif
        FROM templates
        WHERE segment IS NULL AND dil = ? AND aktif = 1
        LIMIT 1
        """,
        (dil,)
    )
    row = cursor.fetchone()
    if row:
        return dict(row)

    # 3. Fall back to any active default template
    cursor.execute(
        """
        SELECT id, segment, dil, konu, govde, aktif
        FROM templates
        WHERE segment IS NULL AND aktif = 1
        LIMIT 1
        """
    )
    row = cursor.fetchone()
    return dict(row) if row else None


def get_template_usage_count(conn: sqlite3.Connection, template_id: int) -> int:
    """
    Count how many times this template has been used/sent.
    """
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT COUNT(*) FROM contact_events
        WHERE tip = 'mesaj_kopyalandi' AND not_metni LIKE ?
        """,
        (f"%Şablon ID: {template_id}%",)
    )
    return cursor.fetchone()[0]


def get_all_templates(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    """Retrieve all templates."""
    cursor = conn.cursor()
    cursor.execute("SELECT id, segment, dil, konu, govde, aktif FROM templates ORDER BY id ASC")
    return [dict(r) for r in cursor.fetchall()]


def save_template(
    conn: sqlite3.Connection,
    dil: str,
    govde: str,
    konu: Optional[str] = None,
    segment: Optional[str] = None,
    template_id: Optional[int] = None
) -> int:
    """Save (insert or update) template with personalization validation."""
    if not validate_template_body(govde):
        raise ValueError("Şablon en az bir kişiselleştirme değişkeni ({ad}, {soyad}, {uzmanlik}) içermelidir.")

    with conn:
        cursor = conn.cursor()
        if template_id:
            cursor.execute(
                """
                UPDATE templates
                SET dil = ?, govde = ?, konu = ?, segment = ?
                WHERE id = ?
                """,
                (dil, govde, konu, segment if segment else None, template_id)
            )
            return template_id
        else:
            cursor.execute(
                """
                INSERT INTO templates (segment, dil, konu, govde, aktif)
                VALUES (?, ?, ?, ?, 1)
                """,
                (segment if segment else None, dil, konu, govde)
            )
            return cursor.lastrowid
