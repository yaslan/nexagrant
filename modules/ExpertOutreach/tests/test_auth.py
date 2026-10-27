import pytest
from src.db import init_db
from src.auth import hash_password, verify_password, authenticate_user, create_user, get_all_users

@pytest.fixture
def test_db():
    conn = init_db(":memory:")
    yield conn
    conn.close()

def test_password_hashing():
    pw = "SuperSecret123!"
    hashed = hash_password(pw)
    assert hashed != pw
    assert verify_password(pw, hashed) is True
    assert verify_password("WrongPassword", hashed) is False

def test_authenticate_user(test_db):
    # Default admin created on init_db
    admin = authenticate_user(test_db, "admin@fonbridge.com", "admin123")
    assert admin is not None
    assert admin["rol"] == "yonetici"
    assert admin["ad_soyad"] == "Sistem Yöneticisi"

    # Invalid password
    assert authenticate_user(test_db, "admin@fonbridge.com", "wrong") is None

    # Create new user
    uid = create_user(test_db, "Test Üye", "uye@fonbridge.com", "uyePass", rol="uye", gunluk_limit=40)
    assert uid > 0
    uye = authenticate_user(test_db, "uye@fonbridge.com", "uyePass")
    assert uye is not None
    assert uye["rol"] == "uye"
    assert uye["gunluk_limit"] == 40

    all_users = get_all_users(test_db)
    assert len(all_users) >= 2
