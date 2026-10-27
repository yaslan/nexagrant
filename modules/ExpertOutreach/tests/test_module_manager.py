import pytest
import sqlite3
from src.db import init_db
from src.auth import create_user, authenticate_user
from src.module_manager import (
    MODULE_ID,
    MODE_STANDARD,
    MODE_PACKAGE,
    MODE_DISABLED,
    get_module_config,
    set_module_config,
    check_user_module_access,
    set_user_plan,
    grant_user_module_license,
    revoke_user_module_license,
    FonBridgeOutreachModule
)


@pytest.fixture
def test_db():
    conn = init_db(":memory:")
    yield conn
    conn.close()


def test_default_module_config(test_db):
    cfg = get_module_config(test_db)
    assert cfg["module_id"] == MODULE_ID
    assert cfg["mode"] == MODE_STANDARD
    assert "Pro" in cfg["allowed_plans"]
    assert "Enterprise" in cfg["allowed_plans"]


def test_standard_mode_access(test_db):
    set_module_config(test_db, mode=MODE_STANDARD)
    
    # Standard user on base plan
    uid = create_user(test_db, "Standart Kullanıcı", "std@fonbridge.com", "pass123", rol="uye", paket="Standart")
    user = authenticate_user(test_db, "std@fonbridge.com", "pass123")
    
    has_access, reason = check_user_module_access(test_db, user)
    assert has_access is True
    assert "Standart FonBridge" in reason


def test_package_mode_access_control(test_db):
    set_module_config(
        test_db,
        mode=MODE_PACKAGE,
        allowed_plans=["Pro", "Enterprise"],
        price="₺4.990 / ay"
    )
    
    # 1. User on 'Standart' plan -> No access
    uid_std = create_user(test_db, "Standart Uye", "std2@fonbridge.com", "pass123", rol="uye", paket="Standart")
    user_std = authenticate_user(test_db, "std2@fonbridge.com", "pass123")
    has_access, reason = check_user_module_access(test_db, user_std)
    assert has_access is False
    assert "Pro, Enterprise" in reason
    
    # 2. User on 'Pro' plan -> Has access
    uid_pro = create_user(test_db, "Pro Uye", "pro@fonbridge.com", "pass123", rol="uye", paket="Pro")
    user_pro = authenticate_user(test_db, "pro@fonbridge.com", "pass123")
    has_access, reason = check_user_module_access(test_db, user_pro)
    assert has_access is True
    assert "Pro" in reason
    
    # 3. Grant standalone module license to Standart user -> Has access
    grant_user_module_license(test_db, uid_std, MODULE_ID)
    user_std_updated = authenticate_user(test_db, "std2@fonbridge.com", "pass123")
    has_access, reason = check_user_module_access(test_db, user_std_updated)
    assert has_access is True
    assert "özel" in reason
    
    # 4. Revoke standalone module license -> Lost access
    revoke_user_module_license(test_db, uid_std, MODULE_ID)
    user_std_revoked = authenticate_user(test_db, "std2@fonbridge.com", "pass123")
    has_access, reason = check_user_module_access(test_db, user_std_revoked)
    assert has_access is False


def test_admin_override(test_db):
    # Even in package mode or disabled mode, admin always has access
    set_module_config(test_db, mode=MODE_DISABLED)
    
    admin = authenticate_user(test_db, "admin@fonbridge.com", "admin123")
    has_access, reason = check_user_module_access(test_db, admin)
    assert has_access is True
    assert "Yönetici" in reason


def test_disabled_mode_regular_user(test_db):
    set_module_config(test_db, mode=MODE_DISABLED)
    
    uid = create_user(test_db, "Normal Uye", "normal@fonbridge.com", "pass123", rol="uye", paket="Enterprise")
    user = authenticate_user(test_db, "normal@fonbridge.com", "pass123")
    
    has_access, reason = check_user_module_access(test_db, user)
    assert has_access is False
    assert "devre dışı" in reason


def test_pluggable_module_class(test_db):
    module = FonBridgeOutreachModule(test_db)
    assert module.id == MODULE_ID
    assert module.name == "Uzman Ulaşım Asistanı (Expert Outreach Assistant)"
    
    admin = authenticate_user(test_db, "admin@fonbridge.com", "admin123")
    assert module.can_access(admin) is True


def test_universal_parent_module_export(test_db):
    from fonbridge_module import FonBridgeOutreachModule as ExportedModule
    mod = ExportedModule(test_db)
    manifest = mod.get_manifest()
    assert manifest["id"] == "expert_outreach"
    assert manifest["version"] == "1.0.0"
    assert "router" in manifest["endpoints"]
