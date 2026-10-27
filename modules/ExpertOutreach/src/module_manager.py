"""
FonBridge Expert Outreach Module (Uzman Ulaşım Asistanı Modülü)
Modular Integration, Licensing, Tier & Commercial Package Management.

Allows this module to be deployed either:
1. 'standart': Available to all users by default (included in base Fonbridge platform).
2. 'paket_eklenti': Commercial add-on / package. Accessible only by licensed plans
   (e.g., Pro, Enterprise, Outreach Add-on) or explicitly assigned user licenses.
3. 'devre_disi': Globally disabled.
"""

import sqlite3
from typing import Dict, Any, List, Tuple, Optional
import config

# Module Metadata
MODULE_ID = "expert_outreach"
MODULE_NAME = "Uzman Ulaşım Asistanı (Expert Outreach Assistant)"
MODULE_VERSION = "1.0.0"
MODULE_ICON = "✉️"
MODULE_CATEGORY = "Networking & EU Funding"
MODULE_DESCRIPTION = (
    "24 AB resmi dili + Türkçe akıllı ulus tespiti, kişiselleştirilmiş LinkedIn mesaj "
    "taslakları, yarı otomatik güvenli iletişim ve 7 günlük takip asistanı."
)

# Modes
MODE_STANDARD = "standart"
MODE_PACKAGE = "paket_eklenti"
MODE_DISABLED = "devre_disi"

ALL_MODES = [MODE_STANDARD, MODE_PACKAGE, MODE_DISABLED]

MODE_LABELS = {
    MODE_STANDARD: "Standart (Tüm Kullanıcılara Açık / Ücretsiz Dahil)",
    MODE_PACKAGE: "Paketli / Satış Modülü (Yalnızca Yetkili Paketler & Lisanslı Kullanıcılar)",
    MODE_DISABLED: "Devre Dışı (Sistem Genelinde Kapalı)"
}

# Available subscription tiers
ALL_PLANS = ["Standart", "Pro", "Enterprise", "Outreach Add-on"]
DEFAULT_ALLOWED_PLANS = ["Pro", "Enterprise", "Outreach Add-on"]


def get_module_config(conn: sqlite3.Connection) -> Dict[str, Any]:
    """Retrieve module operational mode, pricing, and allowed subscription plans."""
    cursor = conn.cursor()
    cursor.execute(
        "SELECT anahtar, deger FROM settings WHERE anahtar LIKE 'module_outreach_%'"
    )
    settings = dict(cursor.fetchall())
    
    mode = settings.get("module_outreach_mode", MODE_STANDARD)
    if mode not in ALL_MODES:
        mode = MODE_STANDARD
        
    allowed_plans_str = settings.get("module_outreach_allowed_plans", ",".join(DEFAULT_ALLOWED_PLANS))
    allowed_plans = [p.strip() for p in allowed_plans_str.split(",") if p.strip()]
    
    price = settings.get("module_outreach_price", "₺4.990 / ay")
    promo_text = settings.get(
        "module_outreach_promo",
        "31.000+ Avrupa fonlama uzmanına 24 AB dilinde kişiselleştirilmiş yarı otomatik ulaşım."
    )
    
    return {
        "module_id": MODULE_ID,
        "name": MODULE_NAME,
        "version": MODULE_VERSION,
        "icon": MODULE_ICON,
        "mode": mode,
        "mode_label": MODE_LABELS.get(mode, mode),
        "allowed_plans": allowed_plans,
        "price": price,
        "promo_text": promo_text,
        "description": MODULE_DESCRIPTION
    }


def set_module_config(
    conn: sqlite3.Connection,
    mode: str,
    allowed_plans: Optional[List[str]] = None,
    price: Optional[str] = None,
    promo_text: Optional[str] = None
) -> None:
    """Save module operational mode and commercial licensing configurations."""
    if mode not in ALL_MODES:
        raise ValueError(f"Geçersiz modül modu: {mode}. Geçerli modlar: {ALL_MODES}")
        
    with conn:
        conn.execute(
            "INSERT OR REPLACE INTO settings (anahtar, deger) VALUES (?, ?)",
            ("module_outreach_mode", mode)
        )
        if allowed_plans is not None:
            conn.execute(
                "INSERT OR REPLACE INTO settings (anahtar, deger) VALUES (?, ?)",
                ("module_outreach_allowed_plans", ",".join(allowed_plans))
            )
        if price is not None:
            conn.execute(
                "INSERT OR REPLACE INTO settings (anahtar, deger) VALUES (?, ?)",
                ("module_outreach_price", price.strip())
            )
        if promo_text is not None:
            conn.execute(
                "INSERT OR REPLACE INTO settings (anahtar, deger) VALUES (?, ?)",
                ("module_outreach_promo", promo_text.strip())
            )


def check_user_module_access(
    conn: sqlite3.Connection,
    user: Dict[str, Any]
) -> Tuple[bool, str]:
    """
    Check if a specific user has access to the Outreach Module.
    Returns:
    (has_access: bool, reason_message: str)
    """
    if not user:
        return False, "Kullanıcı girişi yapılmamış."
        
    cfg = get_module_config(conn)
    mode = cfg["mode"]
    
    # System administrators always have access (for testing and configuration)
    if user.get("rol") == config.ROLE_YONETICI:
        return True, "Yönetici yetkisi ile tam erişim"
        
    # Mode 1: Disabled
    if mode == MODE_DISABLED:
        return False, "Uzman Ulaşım Modülü sistem yöneticisi tarafından geçici olarak devre dışı bırakılmıştır."
        
    # Mode 2: Standard (Included for all users)
    if mode == MODE_STANDARD:
        return True, "Standart FonBridge paketi kapsamında tüm kullanıcılara açıktır."
        
    # Mode 3: Package / Add-on Commercial Tier
    if mode == MODE_PACKAGE:
        # 1. Check user's subscription plan
        user_plan = user.get("paket") or "Standart"
        if user_plan in cfg["allowed_plans"]:
            return True, f"{user_plan} paketiniz kapsamında modül aktif."
            
        # 2. Check individual user module license
        user_modules_str = user.get("moduller") or ""
        user_modules = [m.strip() for m in user_modules_str.split(",") if m.strip()]
        if MODULE_ID in user_modules:
            return True, "Kullanıcınıza özel Uzman Ulaşım Modülü lisansı tanımlanmıştır."
            
        # 3. No access -> return upsell reason
        allowed_str = ", ".join(cfg["allowed_plans"])
        return False, f"Bu modül {allowed_str} paketlerinde veya ek 'Uzman Ulaşım Eklentisi' ile sunulmaktadır."

    return False, "Erişim kısıtlı."


def set_user_plan(conn: sqlite3.Connection, user_id: int, plan: str) -> None:
    """Set user's subscription tier/plan."""
    with conn:
        conn.execute("UPDATE users SET paket = ? WHERE id = ?", (plan, user_id))


def grant_user_module_license(conn: sqlite3.Connection, user_id: int, module_id: str = MODULE_ID) -> None:
    """Grant standalone add-on license for a module to a specific user."""
    cursor = conn.cursor()
    cursor.execute("SELECT moduller FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    current_modules = [m.strip() for m in (row[0] or "").split(",") if m.strip()] if row else []
    
    if module_id not in current_modules:
        current_modules.append(module_id)
        with conn:
            conn.execute(
                "UPDATE users SET moduller = ? WHERE id = ?",
                (",".join(current_modules), user_id)
            )


def revoke_user_module_license(conn: sqlite3.Connection, user_id: int, module_id: str = MODULE_ID) -> None:
    """Revoke standalone add-on license for a module from a specific user."""
    cursor = conn.cursor()
    cursor.execute("SELECT moduller FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    current_modules = [m.strip() for m in (row[0] or "").split(",") if m.strip()] if row else []
    
    if module_id in current_modules:
        current_modules.remove(module_id)
        with conn:
            conn.execute(
                "UPDATE users SET moduller = ? WHERE id = ?",
                (",".join(current_modules), user_id)
            )


class FonBridgeOutreachModule:
    """
    Pluggable FonBridge Module Interface for parent project integration.
    """
    id = MODULE_ID
    name = MODULE_NAME
    version = MODULE_VERSION
    icon = MODULE_ICON
    description = MODULE_DESCRIPTION

    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def get_config(self) -> Dict[str, Any]:
        return get_module_config(self.conn)

    def can_access(self, user: Dict[str, Any]) -> bool:
        has_access, _ = check_user_module_access(self.conn, user)
        return has_access

    def get_access_status(self, user: Dict[str, Any]) -> Tuple[bool, str]:
        return check_user_module_access(self.conn, user)

    def get_manifest(self) -> Dict[str, Any]:
        """Return standardized module manifest for parent platform discovery."""
        return {
            "id": self.id,
            "name": self.name,
            "version": self.version,
            "icon": self.icon,
            "description": self.description,
            "config": self.get_config(),
            "endpoints": {
                "router": "app.py",
                "queue": "src/tracker.py",
                "importer": "src/importer.py",
                "templates": "src/templates.py",
                "exporter": "src/exporter.py"
            }
        }
