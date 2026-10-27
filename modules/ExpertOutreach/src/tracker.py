import sqlite3
import urllib.parse
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
import config


class DailyLimitReachedException(Exception):
    """Raised when user exceeds their daily outreach limit."""
    pass


def generate_linkedin_search_url(ad: str, soyad: str, uzmanlik: Optional[str] = None) -> str:
    """
    Generates a LinkedIn search URL for the user to open in their own browser.
    Contains NO HTTP requests, NO scraping, NO bots.
    """
    query_parts = [ad.strip(), soyad.strip()]
    if uzmanlik:
        # Use primary segment if multiple segments exist
        first_segment = uzmanlik.split("//")[0].strip()
        if first_segment:
            query_parts.append(first_segment)
    
    query = " ".join(query_parts)
    encoded = urllib.parse.quote_plus(query)
    return f"https://www.linkedin.com/search/results/people/?keywords={encoded}"


def get_system_setting(conn: sqlite3.Connection, key: str, default_val: str) -> str:
    """Retrieve setting value or return default."""
    cursor = conn.cursor()
    cursor.execute("SELECT deger FROM settings WHERE anahtar = ?", (key,))
    row = cursor.fetchone()
    return row[0] if row else default_val


def set_system_setting(conn: sqlite3.Connection, key: str, value: str):
    """Update or insert system setting."""
    with conn:
        conn.execute(
            "INSERT INTO settings (anahtar, deger) VALUES (?, ?) ON CONFLICT(anahtar) DO UPDATE SET deger = excluded.deger",
            (key, str(value))
        )


def get_user_daily_limit_status(conn: sqlite3.Connection, user_id: int) -> Dict[str, Any]:
    """
    Calculate user's daily outreach limit status for today.
    Limit precedence: User specific limit -> Global settings limit -> Default 50.
    """
    cursor = conn.cursor()
    
    # 1. Check user specific limit
    cursor.execute("SELECT gunluk_limit FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    user_limit = row[0] if row and row[0] is not None else None
    
    if user_limit is None:
        global_limit_str = get_system_setting(conn, "gunluk_limit", str(config.DEFAULT_DAILY_LIMIT))
        try:
            effective_limit = int(global_limit_str)
        except ValueError:
            effective_limit = config.DEFAULT_DAILY_LIMIT
    else:
        effective_limit = int(user_limit)

    # 2. Count messages marked 'Gönderildi' by this user today
    today_prefix = datetime.now().strftime("%Y-%m-%d")
    cursor.execute(
        """
        SELECT COUNT(*) FROM contact_events
        WHERE user_id = ? 
          AND tip = 'durum_degisti'
          AND not_metni LIKE '%Gönderildi%'
          AND tarih LIKE ?
        """,
        (user_id, f"{today_prefix}%")
    )
    sent_today = cursor.fetchone()[0]

    remaining = max(0, effective_limit - sent_today)
    is_limit_reached = sent_today >= effective_limit

    return {
        "user_id": user_id,
        "daily_limit": effective_limit,
        "sent_today": sent_today,
        "remaining": remaining,
        "is_limit_reached": is_limit_reached
    }


def get_team_daily_stats(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    """Retrieve team outreach stats for today (Admin view)."""
    today_prefix = datetime.now().strftime("%Y-%m-%d")
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT u.id, u.ad_soyad, u.eposta, u.rol, u.gunluk_limit,
               COUNT(ce.id) as sent_count
        FROM users u
        LEFT JOIN contact_events ce ON u.id = ce.user_id 
             AND ce.tip = 'durum_degisti' 
             AND ce.not_metni LIKE '%Gönderildi%'
             AND ce.tarih LIKE ?
        WHERE u.aktif = 1
        GROUP BY u.id
        ORDER BY sent_count DESC
        """,
        (f"{today_prefix}%",)
    )
    results = []
    global_limit = int(get_system_setting(conn, "gunluk_limit", str(config.DEFAULT_DAILY_LIMIT)))
    for r in cursor.fetchall():
        u_limit = r[4] if r[4] is not None else global_limit
        results.append({
            "user_id": r[0],
            "ad_soyad": r[1],
            "eposta": r[2],
            "rol": r[3],
            "limit": u_limit,
            "sent_today": r[5],
            "remaining": max(0, u_limit - r[5])
        })
    return results


def update_expert_status(
    conn: sqlite3.Connection,
    expert_id: int,
    new_status: str,
    user_id: int,
    note: Optional[str] = None
) -> Dict[str, Any]:
    """
    Update expert status, handle opt-out and daily limit, and record audit event.
    """
    cursor = conn.cursor()
    cursor.execute("SELECT id, durum, opt_out FROM experts WHERE id = ?", (expert_id,))
    expert = cursor.fetchone()
    if not expert:
        raise ValueError(f"Uzman bulunamadı (ID: {expert_id})")

    old_status = expert["durum"]
    now_iso = datetime.now().isoformat()

    # If new status is 'Gönderildi', verify daily limit
    if new_status == config.STATUS_GONDERILDI:
        limit_status = get_user_daily_limit_status(conn, user_id)
        if limit_status["is_limit_reached"]:
            raise DailyLimitReachedException(
                f"Günlük mesaj gönderim limitinize ({limit_status['daily_limit']}) ulaştınız! Kuyruk kapatıldı."
            )

    # Opt-out logic: 'Bir daha yazma' or 'İlgilenmiyor'
    is_opt_out = 1 if new_status in [config.STATUS_BIR_DAHA_YAZMA, config.STATUS_ILGILENMIYOR] else expert["opt_out"]
    son_gonderim = now_iso if new_status == config.STATUS_GONDERILDI else None

    with conn:
        if son_gonderim:
            conn.execute(
                """
                UPDATE experts
                SET durum = ?, opt_out = ?, son_gonderim_tarihi = ?, updated_at = ?
                WHERE id = ?
                """,
                (new_status, is_opt_out, son_gonderim, now_iso, expert_id)
            )
        else:
            conn.execute(
                """
                UPDATE experts
                SET durum = ?, opt_out = ?, updated_at = ?
                WHERE id = ?
                """,
                (new_status, is_opt_out, now_iso, expert_id)
            )

        # Log contact event
        event_note = f"Durum '{old_status}' -> '{new_status}' olarak güncellendi."
        if note:
            event_note += f" Not: {note}"
            
        conn.execute(
            """
            INSERT INTO contact_events (expert_id, user_id, tip, not_metni, tarih)
            VALUES (?, ?, 'durum_degisti', ?, ?)
            """,
            (expert_id, user_id, event_note, now_iso)
        )

    return {"expert_id": expert_id, "old_status": old_status, "new_status": new_status, "opt_out": is_opt_out}


def log_copy_event(
    conn: sqlite3.Connection,
    expert_id: int,
    user_id: int,
    template_id: Optional[int] = None
):
    """Log when a user copies the outreach message."""
    now_iso = datetime.now().isoformat()
    note = f"Mesaj taslağı panoya kopyalandı. (Şablon ID: {template_id})" if template_id else "Mesaj taslağı panoya kopyalandı."
    with conn:
        conn.execute(
            """
            INSERT INTO contact_events (expert_id, user_id, tip, not_metni, tarih)
            VALUES (?, ?, 'mesaj_kopyalandi', ?, ?)
            """,
            (expert_id, user_id, note, now_iso)
        )


def add_expert_note(
    conn: sqlite3.Connection,
    expert_id: int,
    user_id: int,
    note: str
):
    """Add a free-text note for an expert."""
    now_iso = datetime.now().isoformat()
    with conn:
        conn.execute(
            """
            INSERT INTO contact_events (expert_id, user_id, tip, not_metni, tarih)
            VALUES (?, ?, 'not_eklendi', ?, ?)
            """,
            (expert_id, user_id, note, now_iso)
        )


def get_expert_events(conn: sqlite3.Connection, expert_id: int) -> List[Dict[str, Any]]:
    """Retrieve all audit events for an expert."""
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT ce.id, ce.tip, ce.not_metni, ce.tarih, u.ad_soyad, u.eposta
        FROM contact_events ce
        LEFT JOIN users u ON ce.user_id = u.id
        WHERE ce.expert_id = ?
        ORDER BY ce.tarih DESC
        """,
        (expert_id,)
    )
    return [dict(r) for r in cursor.fetchall()]


def get_followup_list(
    conn: sqlite3.Connection,
    user_id: Optional[int] = None,
    role: str = config.ROLE_YONETICI
) -> List[Dict[str, Any]]:
    """
    Get follow-up list:
    Records in 'Gönderildi' status where son_gonderim_tarihi is >= followup_days ago
    and opt_out = 0.
    For members, only records assigned to that member.
    """
    followup_days_str = get_system_setting(conn, "takip_gun", str(config.DEFAULT_FOLLOWUP_DAYS))
    followup_days = int(followup_days_str) if followup_days_str.isdigit() else config.DEFAULT_FOLLOWUP_DAYS
    
    cutoff_date = (datetime.now() - timedelta(days=followup_days)).isoformat()
    
    query = """
        SELECT e.id, e.ad, e.soyad, e.uzmanlik, e.dil, e.durum, e.son_gonderim_tarihi,
               u.ad_soyad as atanan_uye
        FROM experts e
        LEFT JOIN assignments a ON e.id = a.expert_id
        LEFT JOIN users u ON a.user_id = u.id
        WHERE e.opt_out = 0
          AND e.durum = ?
          AND e.son_gonderim_tarihi <= ?
    """
    params = [config.STATUS_GONDERILDI, cutoff_date]
    
    if role == config.ROLE_UYE and user_id is not None:
        query += " AND a.user_id = ?"
        params.append(user_id)
        
    query += " ORDER BY e.son_gonderim_tarihi ASC"
    
    cursor = conn.cursor()
    cursor.execute(query, params)
    return [dict(r) for r in cursor.fetchall()]


def get_experts_queue(
    conn: sqlite3.Connection,
    user_id: int,
    role: str = config.ROLE_YONETICI,
    status_filter: Optional[str] = config.STATUS_BEKLIYOR,
    segment_filter: Optional[str] = None,
    search_query: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
) -> List[Dict[str, Any]]:
    """
    Retrieve outreach queue.
    Opt-out records (opt_out = 1) are never returned in active queues.
    Members only see experts assigned to them (or in their segments).
    """
    query = """
        SELECT e.id, e.ad, e.soyad, e.uzmanlik, e.ulus, e.dil, e.durum, e.opt_out,
               e.son_gonderim_tarihi, a.user_id as assigned_user_id,
               u.ad_soyad as assigned_user_name
        FROM experts e
        LEFT JOIN assignments a ON e.id = a.expert_id
        LEFT JOIN users u ON a.user_id = u.id
        WHERE e.opt_out = 0
    """
    params: List[Any] = []

    if status_filter:
        query += " AND e.durum = ?"
        params.append(status_filter)

    if segment_filter:
        query += " AND e.uzmanlik LIKE ?"
        params.append(f"%{segment_filter}%")

    if search_query:
        search_param = f"%{search_query.strip().lower()}%"
        query += " AND (lower(e.ad) LIKE ? OR lower(e.soyad) LIKE ? OR lower(e.uzmanlik) LIKE ?)"
        params.extend([search_param, search_param, search_param])

    # Role-based restriction:
    if role == config.ROLE_UYE:
        query += " AND a.user_id = ?"
        params.append(user_id)

    query += " ORDER BY e.id ASC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    cursor = conn.cursor()
    cursor.execute(query, params)
    return [dict(r) for r in cursor.fetchall()]


def assign_expert(
    conn: sqlite3.Connection,
    expert_id: int,
    user_id: int,
    segment_id: Optional[int] = None,
    assigned_by_user_id: Optional[int] = None
):
    """
    Assign an expert to a user.
    Each expert can be assigned to only one user.
    """
    now_iso = datetime.now().isoformat()
    with conn:
        conn.execute(
            """
            INSERT INTO assignments (expert_id, user_id, segment_id, atama_tarihi)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(expert_id) DO UPDATE SET
                user_id = excluded.user_id,
                segment_id = excluded.segment_id,
                atama_tarihi = excluded.atama_tarihi
            """,
            (expert_id, user_id, segment_id, now_iso)
        )
        
        # Log event
        actor_id = assigned_by_user_id or user_id
        conn.execute(
            """
            INSERT INTO contact_events (expert_id, user_id, tip, not_metni, tarih)
            VALUES (?, ?, 'atandi', ?, ?)
            """,
            (expert_id, actor_id, f"Uzman kullanıcı ID: {user_id}'ye atandı.", now_iso)
        )


def assign_segment_to_user(
    conn: sqlite3.Connection,
    segment_name: str,
    user_id: int,
    assigned_by_user_id: Optional[int] = None
) -> int:
    """
    Assign all unassigned experts matching a segment to a member.
    """
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT e.id FROM experts e
        LEFT JOIN assignments a ON e.id = a.expert_id
        WHERE a.expert_id IS NULL AND e.uzmanlik LIKE ?
        """,
        (f"%{segment_name}%",)
    )
    unassigned_ids = [r[0] for r in cursor.fetchall()]
    
    for exp_id in unassigned_ids:
        assign_expert(conn, exp_id, user_id, None, assigned_by_user_id)
        
    return len(unassigned_ids)


def delete_expert_permanently(conn: sqlite3.Connection, expert_id: int) -> bool:
    """
    Permanently delete an expert and all related events and assignments (KVKK/GDPR right).
    """
    with conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM experts WHERE id = ?", (expert_id,))
        return cursor.rowcount > 0
