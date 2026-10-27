import pytest
from datetime import datetime, timedelta
import config
from src.db import init_db
from src.auth import create_user
from src.tracker import (
    generate_linkedin_search_url,
    update_expert_status,
    log_copy_event,
    get_expert_events,
    get_user_daily_limit_status,
    get_followup_list,
    get_experts_queue,
    assign_expert,
    delete_expert_permanently,
    DailyLimitReachedException
)


@pytest.fixture
def test_db():
    conn = init_db(":memory:")
    yield conn
    conn.close()


@pytest.fixture
def sample_users_and_expert(test_db):
    user_a = create_user(test_db, "Üye Ahmet", "ahmet@fonbridge.com", "pass123", "uye", gunluk_limit=2)
    user_b = create_user(test_db, "Üye Ayşe", "ayse@fonbridge.com", "pass123", "uye", gunluk_limit=50)
    
    cursor = test_db.cursor()
    cursor.execute(
        """
        INSERT INTO experts (ad, soyad, uzmanlik, dil, durum, opt_out, created_at, updated_at)
        VALUES ('Mehmet', 'Öztürk', 'Finans', 'TR', 'Bekliyor', 0, '2026-01-01', '2026-01-01')
        """
    )
    expert_id = cursor.lastrowid
    return {"user_a": user_a, "user_b": user_b, "expert_id": expert_id}


def test_generate_linkedin_search_url():
    url = generate_linkedin_search_url("Ahmet", "Yılmaz", "Finans // Hukuk")
    assert "https://www.linkedin.com/search/results/people/?keywords=" in url
    assert "Ahmet" in url
    assert "Y%C4%B1lmaz" in url or "Yılmaz" in url or "Finans" in url


def test_status_update_and_audit_event(test_db, sample_users_and_expert):
    user_id = sample_users_and_expert["user_a"]
    exp_id = sample_users_and_expert["expert_id"]

    res = update_expert_status(test_db, exp_id, config.STATUS_GONDERILDI, user_id, note="İlk mesaj yollandı")
    assert res["new_status"] == config.STATUS_GONDERILDI

    # Check contact events audit trail
    events = get_expert_events(test_db, exp_id)
    assert len(events) == 1
    assert events[0]["tip"] == "durum_degisti"
    assert "İlk mesaj yollandı" in events[0]["not_metni"]
    assert events[0]["ad_soyad"] == "Üye Ahmet"


def test_user_daily_limit_enforcement(test_db, sample_users_and_expert):
    user_a = sample_users_and_expert["user_a"] # limit = 2
    user_b = sample_users_and_expert["user_b"] # limit = 50

    cursor = test_db.cursor()
    cursor.execute("INSERT INTO experts (ad, soyad, uzmanlik) VALUES ('E1', 'S1', 'X')")
    e1 = cursor.lastrowid
    cursor.execute("INSERT INTO experts (ad, soyad, uzmanlik) VALUES ('E2', 'S2', 'X')")
    e2 = cursor.lastrowid
    cursor.execute("INSERT INTO experts (ad, soyad, uzmanlik) VALUES ('E3', 'S3', 'X')")
    e3 = cursor.lastrowid

    # User A sends 1st message
    update_expert_status(test_db, e1, config.STATUS_GONDERILDI, user_a)
    status_a = get_user_daily_limit_status(test_db, user_a)
    assert status_a["sent_today"] == 1
    assert status_a["remaining"] == 1
    assert status_a["is_limit_reached"] is False

    # User A sends 2nd message -> limit reached
    update_expert_status(test_db, e2, config.STATUS_GONDERILDI, user_a)
    status_a = get_user_daily_limit_status(test_db, user_a)
    assert status_a["sent_today"] == 2
    assert status_a["remaining"] == 0
    assert status_a["is_limit_reached"] is True

    # User A attempts 3rd message -> raises DailyLimitReachedException
    with pytest.raises(DailyLimitReachedException):
        update_expert_status(test_db, e3, config.STATUS_GONDERILDI, user_a)

    # Per-user limit isolation: User B can still send messages freely!
    update_expert_status(test_db, e3, config.STATUS_GONDERILDI, user_b)
    status_b = get_user_daily_limit_status(test_db, user_b)
    assert status_b["sent_today"] == 1
    assert status_b["is_limit_reached"] is False


def test_opt_out_exclusion(test_db, sample_users_and_expert):
    user_id = sample_users_and_expert["user_a"]
    exp_id = sample_users_and_expert["expert_id"]

    # Queue contains the expert
    queue_before = get_experts_queue(test_db, user_id=user_id, role=config.ROLE_YONETICI)
    assert any(e["id"] == exp_id for e in queue_before)

    # Mark as 'Bir daha yazma'
    update_expert_status(test_db, exp_id, config.STATUS_BIR_DAHA_YAZMA, user_id)

    # Queue must exclude opt-out contacts
    queue_after = get_experts_queue(test_db, user_id=user_id, role=config.ROLE_YONETICI)
    assert not any(e["id"] == exp_id for e in queue_after)


def test_followup_list(test_db, sample_users_and_expert):
    user_id = sample_users_and_expert["user_a"]
    cursor = test_db.cursor()

    # 1. Expert sent 10 days ago (should be in followup list, default followup is 7 days)
    ten_days_ago = (datetime.now() - timedelta(days=10)).isoformat()
    cursor.execute(
        """
        INSERT INTO experts (ad, soyad, uzmanlik, durum, opt_out, son_gonderim_tarihi)
        VALUES ('Eski', 'Gonderim', 'Finans', 'Gönderildi', 0, ?)
        """,
        (ten_days_ago,)
    )
    e_old = cursor.lastrowid
    assign_expert(test_db, e_old, user_id)

    # 2. Expert sent 2 days ago (should NOT be in followup list yet)
    two_days_ago = (datetime.now() - timedelta(days=2)).isoformat()
    cursor.execute(
        """
        INSERT INTO experts (ad, soyad, uzmanlik, durum, opt_out, son_gonderim_tarihi)
        VALUES ('Yeni', 'Gonderim', 'Finans', 'Gönderildi', 0, ?)
        """,
        (two_days_ago,)
    )
    e_new = cursor.lastrowid
    assign_expert(test_db, e_new, user_id)

    followups = get_followup_list(test_db, user_id=user_id, role=config.ROLE_UYE)
    followup_ids = [f["id"] for f in followups]
    assert e_old in followup_ids
    assert e_new not in followup_ids


def test_single_expert_single_user_assignment(test_db, sample_users_and_expert):
    user_a = sample_users_and_expert["user_a"]
    user_b = sample_users_and_expert["user_b"]
    exp_id = sample_users_and_expert["expert_id"]

    # Assign to user A
    assign_expert(test_db, exp_id, user_a)
    cursor = test_db.cursor()
    cursor.execute("SELECT user_id FROM assignments WHERE expert_id = ?", (exp_id,))
    assert cursor.fetchone()[0] == user_a

    # Assigning to user B reassigns (one expert can only be assigned to one member)
    assign_expert(test_db, exp_id, user_b)
    cursor.execute("SELECT COUNT(*), user_id FROM assignments WHERE expert_id = ?", (exp_id,))
    row = cursor.fetchone()
    assert row[0] == 1
    assert row[1] == user_b


def test_member_queue_isolation(test_db, sample_users_and_expert):
    user_a = sample_users_and_expert["user_a"]
    user_b = sample_users_and_expert["user_b"]
    exp_id = sample_users_and_expert["expert_id"]

    # Assign expert to user A
    assign_expert(test_db, exp_id, user_a)

    # User A sees the expert in their queue
    queue_a = get_experts_queue(test_db, user_id=user_a, role=config.ROLE_UYE)
    assert any(e["id"] == exp_id for e in queue_a)

    # User B does NOT see user A's expert in their queue
    queue_b = get_experts_queue(test_db, user_id=user_b, role=config.ROLE_UYE)
    assert not any(e["id"] == exp_id for e in queue_b)

    # Admin sees all
    queue_admin = get_experts_queue(test_db, user_id=1, role=config.ROLE_YONETICI)
    assert any(e["id"] == exp_id for e in queue_admin)


def test_permanent_deletion_gdpr(test_db, sample_users_and_expert):
    user_id = sample_users_and_expert["user_a"]
    exp_id = sample_users_and_expert["expert_id"]

    # Add assignment and events
    assign_expert(test_db, exp_id, user_id)
    log_copy_event(test_db, exp_id, user_id)

    # Verify event exists
    events_before = get_expert_events(test_db, exp_id)
    assert len(events_before) >= 1

    # Permanently delete expert
    deleted = delete_expert_permanently(test_db, exp_id)
    assert deleted is True

    # Verify expert is gone
    cursor = test_db.cursor()
    cursor.execute("SELECT COUNT(*) FROM experts WHERE id = ?", (exp_id,))
    assert cursor.fetchone()[0] == 0

    # Verify related contact_events are cleaned up (ON DELETE CASCADE)
    cursor.execute("SELECT COUNT(*) FROM contact_events WHERE expert_id = ?", (exp_id,))
    assert cursor.fetchone()[0] == 0

    # Verify assignment is cleaned up
    cursor.execute("SELECT COUNT(*) FROM assignments WHERE expert_id = ?", (exp_id,))
    assert cursor.fetchone()[0] == 0
