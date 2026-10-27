"""
FonBridge Outreach Module - Universal Pluggable Integration Entrypoint.

This file provides a plug-and-play interface for integrating the Expert Outreach Assistant
into the parent FonBridge enterprise platform or any modular portal.

Example Parent Application Usage:
---------------------------------
from fonbridge_module import FonBridgeOutreachModule
import sqlite3

conn = sqlite3.connect("data/fonbridge.db")
outreach_module = FonBridgeOutreachModule(conn)

# Check user access (respects standard mode vs commercial package tier)
has_access, message = outreach_module.check_access(current_user)

# Retrieve commercial configuration
config = outreach_module.get_config()
"""

import sqlite3
from typing import Dict, Any, Tuple, Optional, List
from src.module_manager import (
    MODULE_ID,
    MODULE_NAME,
    MODULE_VERSION,
    MODULE_ICON,
    MODULE_DESCRIPTION,
    MODE_STANDARD,
    MODE_PACKAGE,
    MODE_DISABLED,
    ALL_MODES,
    ALL_PLANS,
    get_module_config,
    set_module_config,
    check_user_module_access,
    grant_user_module_license,
    revoke_user_module_license,
    set_user_plan
)


class FonBridgeOutreachModule:
    """
    Standard Pluggable Module Class for FonBridge Platform.
    """
    id: str = MODULE_ID
    slug: str = MODULE_ID
    name: str = MODULE_NAME
    version: str = MODULE_VERSION
    icon: str = MODULE_ICON
    description: str = MODULE_DESCRIPTION

    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def get_manifest(self) -> Dict[str, Any]:
        """Return standardized module manifest for parent platform discovery."""
        return {
            "id": self.id,
            "slug": self.slug,
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

    def get_config(self) -> Dict[str, Any]:
        """Get module operational mode, pricing, and allowed plans."""
        return get_module_config(self.conn)

    def set_mode(self, mode: str, allowed_plans: Optional[List[str]] = None, price: Optional[str] = None):
        """Configure standard vs commercial package mode."""
        set_module_config(self.conn, mode=mode, allowed_plans=allowed_plans, price=price)

    def check_access(self, user: Dict[str, Any]) -> Tuple[bool, str]:
        """Check if user has access based on platform licensing mode."""
        return check_user_module_access(self.conn, user)

    def can_access(self, user: Dict[str, Any]) -> bool:
        """Boolean check for gating access."""
        has_access, _ = check_user_module_access(self.conn, user)
        return has_access

    def grant_license(self, user_id: int):
        """Grant standalone user license for this module."""
        grant_user_module_license(self.conn, user_id, self.slug)

    def revoke_license(self, user_id: int):
        """Revoke standalone user license for this module."""
        revoke_user_module_license(self.conn, user_id, self.slug)

    def set_user_plan(self, user_id: int, plan: str):
        """Set user's subscription tier."""
        set_user_plan(self.conn, user_id, plan)
