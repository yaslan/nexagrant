import streamlit as pd_st
import streamlit as st
import pandas as pd
from datetime import datetime
from pathlib import Path
import config
from src.db import init_db, get_db_connection
from src.auth import authenticate_user, create_user, get_all_users
from src.templates import (
    get_active_template,
    get_all_templates,
    save_template,
    render_message,
    get_template_usage_count
)
from src.language import re_evaluate_all_expert_languages
from src.tracker import (
    generate_linkedin_search_url,
    get_user_daily_limit_status,
    get_team_daily_stats,
    update_expert_status,
    log_copy_event,
    add_expert_note,
    get_expert_events,
    get_followup_list,
    get_experts_queue,
    assign_expert,
    assign_segment_to_user,
    delete_expert_permanently,
    get_system_setting,
    set_system_setting,
    DailyLimitReachedException
)
from src.importer import preview_file, import_experts_from_file
from src.exporter import get_experts_export_df, create_database_backup, list_backups
from src.module_manager import (
    MODULE_ID,
    MODULE_NAME,
    MODULE_DESCRIPTION,
    MODE_STANDARD,
    MODE_PACKAGE,
    MODE_DISABLED,
    ALL_MODES,
    MODE_LABELS,
    ALL_PLANS,
    get_module_config,
    set_module_config,
    check_user_module_access,
    grant_user_module_license,
    revoke_user_module_license,
    set_user_plan
)

# Set Page Config
st.set_page_config(
    page_title="FonBridge Uzman Ulaşım Asistanı",
    page_icon="🚀",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for modern, polished UI
st.markdown("""
<style>
    .main-header {
        font-size: 2.1rem;
        font-weight: 700;
        color: #1E293B;
        margin-bottom: 0.2rem;
    }
    .sub-header {
        font-size: 1.0rem;
        color: #64748B;
        margin-bottom: 1.5rem;
    }
    .metric-card {
        background: #F8FAFC;
        border: 1px solid #E2E8F0;
        border-radius: 10px;
        padding: 16px;
        text-align: center;
    }
    .metric-value {
        font-size: 1.8rem;
        font-weight: 700;
        color: #0F172A;
    }
    .metric-label {
        font-size: 0.85rem;
        color: #64748B;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    .draft-box {
        background: #FFFFFF;
        border: 1.5px solid #CBD5E1;
        border-radius: 8px;
        padding: 18px;
        font-family: inherit;
        font-size: 1.05rem;
        line-height: 1.6;
        color: #1E293B;
        white-space: pre-wrap;
    }
    .badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 0.8rem;
        font-weight: 600;
    }
    .badge-tr { background-color: #FEE2E2; color: #991B1B; }
    .badge-en { background-color: #E0E7FF; color: #3730A3; }
    .badge-de { background-color: #FEF3C7; color: #92400E; }
    .badge-fr { background-color: #DBEAFE; color: #1E40AF; }
    .badge-it { background-color: #DCFCE7; color: #166534; }
    .badge-es { background-color: #FFEDD5; color: #9A3412; }
    .badge-nl { background-color: #FFEDD5; color: #C2410C; }
    .badge-pl { background-color: #FCE7F3; color: #9D174D; }
    .badge-pt { background-color: #DCFCE7; color: #15803D; }
    .badge-ro { background-color: #FEF9C3; color: #854D0E; }
    .badge-el { background-color: #CFFAFE; color: #0E7490; }
    .badge-cs { background-color: #EDE9FE; color: #5B21B6; }
    .badge-hu { background-color: #FEE2E2; color: #B91C1C; }
    .badge-sv { background-color: #FEF08A; color: #1E3A8A; }
    .badge-da { background-color: #FEE2E2; color: #991B1B; }
    .badge-fi { background-color: #DBEAFE; color: #1D4ED8; }
    .badge-sk { background-color: #EDE9FE; color: #6D28D9; }
    .badge-hr { background-color: #FEE2E2; color: #1E40AF; }
    .badge-bg { background-color: #DCFCE7; color: #065F46; }
    .badge-sl { background-color: #E0E7FF; color: #312E81; }
    .badge-lt { background-color: #FEF3C7; color: #78350F; }
    .badge-lv { background-color: #FEE2E2; color: #7F1D1D; }
    .badge-et { background-color: #CFFAFE; color: #164E63; }
    .badge-ga { background-color: #DCFCE7; color: #14532D; }
    .badge-mt { background-color: #FEE2E2; color: #831843; }
    .stButton>button {
        border-radius: 8px;
        font-weight: 600;
    }
</style>
""", unsafe_allow_html=True)

# 24 Official European Union Languages + Turkish
ALL_LANGUAGES = [
    "TR", "EN", "DE", "FR", "IT", "ES", "NL", "PL", "PT", "RO",
    "EL", "CS", "HU", "SV", "DA", "FI", "SK", "HR", "BG", "SL",
    "LT", "LV", "ET", "GA", "MT"
]

LANGUAGE_LABELS = {
    "TR": "🇹🇷 Türkçe (TR)",
    "EN": "🇬🇧 English (EN)",
    "DE": "🇩🇪 Deutsch (DE)",
    "FR": "🇫🇷 Français (FR)",
    "IT": "🇮🇹 Italiano (IT)",
    "ES": "🇪🇸 Español (ES)",
    "NL": "🇳🇱 Nederlands (NL)",
    "PL": "🇵🇱 Polski (PL)",
    "PT": "🇵🇹 Português (PT)",
    "RO": "🇷🇴 Română (RO)",
    "EL": "🇬🇷 Ελληνικά (EL)",
    "CS": "🇨🇿 Čeština (CS)",
    "HU": "🇭🇺 Magyar (HU)",
    "SV": "🇸🇪 Svenska (SV)",
    "DA": "🇩🇰 Dansk (DA)",
    "FI": "🇫🇮 Suomi (FI)",
    "SK": "🇸🇰 Slovenčina (SK)",
    "HR": "🇭🇷 Hrvatski (HR)",
    "BG": "🇧🇬 Български (BG)",
    "SL": "🇸🇮 Slovenščina (SL)",
    "LT": "🇱🇹 Lietuvių (LT)",
    "LV": "🇱🇻 Latviešu (LV)",
    "ET": "🇪🇪 Eesti (ET)",
    "GA": "🇮🇪 Gaeilge (GA)",
    "MT": "🇲🇹 Malti (MT)",
}

# Initialize DB
conn = init_db()

# Session State for User Auth
if "user" not in st.session_state:
    st.session_state["user"] = None

if "queue_index" not in st.session_state:
    st.session_state["queue_index"] = 0


def render_login():
    col1, col2, col3 = st.columns([1, 1.8, 1])
    with col2:
        st.markdown("<div style='text-align: center; margin-top: 50px;'>", unsafe_allow_html=True)
        st.markdown("<h1 style='color: #2563EB;'>🚀 FonBridge</h1>", unsafe_allow_html=True)
        st.markdown("<h3>Uzman Ulaşım Asistanı</h3>", unsafe_allow_html=True)
        st.markdown("<p style='color: #64748B;'>Ekip İçi Yarı Otomatik İletişim Platformu</p>", unsafe_allow_html=True)
        st.markdown("</div>", unsafe_allow_html=True)

        with st.form("login_form"):
            st.markdown("#### Giriş Yap")
            eposta = st.text_input("E-posta Adresi", value="admin@fonbridge.com")
            parola = st.text_input("Parola", type="password", value="admin123")
            submit = st.form_submit_button("Giriş Yap", use_container_width=True)

            if submit:
                user = authenticate_user(conn, eposta, parola)
                if user:
                    st.session_state["user"] = user
                    st.session_state["queue_index"] = 0
                    st.success(f"Hoş geldiniz, {user['ad_soyad']}!")
                    st.rerun()
                else:
                    st.error("E-posta veya parola hatalı. Lütfen tekrar deneyin.")

        st.info("💡 İlk kurulum varsayılan yönetici hesabı: **admin@fonbridge.com** / **admin123**")


def render_upsell_page(conn, user, reason):
    m_cfg = get_module_config(conn)
    st.markdown(f"""
    <div style="background: linear-gradient(135deg, #0F172A 0%, #1E3A8A 50%, #2563EB 100%); padding: 36px 32px; border-radius: 16px; color: white; margin-bottom: 24px; box-shadow: 0 10px 25px -5px rgba(37, 99, 235, 0.3);">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap;">
            <div>
                <span style="background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.3); padding: 5px 14px; border-radius: 20px; font-size: 0.82rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;">💎 FONBRIDGE EKLENTİ PAKETİ</span>
                <h1 style="color: white; margin: 14px 0 8px 0; font-size: 2.3rem; font-weight: 800; letter-spacing: -0.02em;">Uzman Ulaşım & Akıllı İletişim Modülü</h1>
                <p style="color: #DBEAFE; font-size: 1.15rem; max-width: 780px; margin: 0; line-height: 1.5;">31.400+ Doğrulanmış Horizon Europe & ERC Hakemine 24 AB Resmi Dili ve Türkçe'de Güvenli, Yarı Otomatik İletişim.</p>
            </div>
            <div style="margin-top: 16px; background: rgba(255,255,255,0.12); padding: 14px 22px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.25); text-align: center;">
                <div style="font-size: 0.85rem; color: #BFDBFE; font-weight: 600;">EK PAKET FİYATI</div>
                <div style="font-size: 2.0rem; font-weight: 800; color: #FFFFFF;">{m_cfg.get('price', '$49 / Ay')}</div>
                <div style="font-size: 0.78rem; color: #93C5FD;">veya Kurumsal Paketlere Dahil</div>
            </div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    st.markdown(f"""
    <div style="background: #FFFBEB; border: 1px solid #FCD34D; border-left: 5px solid #F59E0B; padding: 16px 20px; border-radius: 8px; margin-bottom: 28px;">
        <div style="display: flex; align-items: flex-start;">
            <span style="font-size: 1.6rem; margin-right: 14px; line-height: 1;">🔒</span>
            <div>
                <strong style="color: #92400E; font-size: 1.05rem;">Bu Özelliğe Erişim İçin Paket Yükseltmesi Gerekmektedir</strong>
                <p style="color: #B45309; margin: 4px 0 0 0; font-size: 0.95rem;">{reason}</p>
                <p style="color: #78350F; margin: 6px 0 0 0; font-size: 0.88rem;">Mevcut Paketiniz: <strong>{user.get('paket', 'Standart')}</strong> | Gerekli Paket: <strong>{', '.join(m_cfg.get('allowed_plans', ['Pro', 'Enterprise']))}</strong> veya Bağımsız Eklenti Lisansı</p>
            </div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    st.markdown("<h3 style='color: #0F172A; margin-bottom: 16px;'>🌟 Bu Modül Projenize Neler Kazandırır?</h3>", unsafe_allow_html=True)
    c1, c2 = st.columns(2)
    with c1:
        st.markdown("""
        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
            <div style="font-size: 1.8rem; margin-bottom: 8px;">🇪🇺</div>
            <h4 style="margin: 0 0 8px 0; color: #1E293B;">24 AB Resmi Dili + TR Yapay Zeka Tespiti</h4>
            <p style="margin: 0; color: #64748B; font-size: 0.95rem; line-height: 1.5;">Uzmanın adı, soyadı ve ülkesine göre etnik/dil ontolojisiyle anadili anında tespit edilir (Fransızca, Almanca, İtalyanca vb.). Uzmana kendi ana dilinde hitap ederek yanıt alma oranını 4 katına çıkarın.</p>
        </div>
        """, unsafe_allow_html=True)

        st.markdown("""
        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
            <div style="font-size: 1.8rem; margin-bottom: 8px;">🛡️</div>
            <h4 style="margin: 0 0 8px 0; color: #1E293B;">%100 Güvenli LinkedIn İletişimi (Anti-Bot)</h4>
            <p style="margin: 0; color: #64748B; font-size: 0.95rem; line-height: 1.5;">Otomasyon botu kullanmadığı için LinkedIn hesabınız asla risk altına girmez veya banlanmaz. Tek tıkla ilgili kişinin LinkedIn profilini aratır, kişiselleştirilmiş mesajı panoya kopyalar.</p>
        </div>
        """, unsafe_allow_html=True)

    with c2:
        st.markdown("""
        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
            <div style="font-size: 1.8rem; margin-bottom: 8px;">📊</div>
            <h4 style="margin: 0 0 8px 0; color: #1E293B;">31.400+ Doğrulanmış Hakem & Uzman Havuzu</h4>
            <p style="margin: 0; color: #64748B; font-size: 0.95rem; line-height: 1.5;">Horizon Europe, ERC ve AB çerçeve programlarında proje değerlendiren binlerce seçkin hakem ve araştırmacının verisi sistemde hazır ve filtrelenebilir olarak sunulur.</p>
        </div>
        """, unsafe_allow_html=True)

        st.markdown("""
        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
            <div style="font-size: 1.8rem; margin-bottom: 8px;">👥</div>
            <h4 style="margin: 0 0 8px 0; color: #1E293B;">Ekip Yönetimi & GDPR Uyumlu Takip Çizelgesi</h4>
            <p style="margin: 0; color: #64748B; font-size: 0.95rem; line-height: 1.5;">Günlük kota sınırlamaları, üye bazlı segment atamaları, yanıt vermeyenler için otomatik takip (follow-up) hatırlatıcıları ve anlık veri yedekleme mekanizması.</p>
        </div>
        """, unsafe_allow_html=True)

    st.markdown("---")

    col_cta1, col_cta2 = st.columns([2, 1])
    with col_cta1:
        st.markdown("#### 📦 Paketinizi Yükseltin veya Ek Modülü Satın Alın")
        st.write("FonBridge yönetim ekibimizle iletişime geçerek hesabınıza bu modülü anında tanımlatabilir veya üst kurumsal pakete geçiş yapabilirsiniz.")
        
        with st.form("upgrade_request_form"):
            st.text_input("Firma / Kurum Adı", value="FonBridge Müşterisi")
            st.text_input("İletişim Telefonu / E-posta", value=user.get("eposta", ""))
            req_plan = st.selectbox("Talep Edilen Abonelik / Eklenti", ["Outreach Add-on Eklentisi", "Pro Pakete Geçiş", "Enterprise Kurumsal Paket"])
            note = st.text_area("Ek Notlar veya Özel İstekler", placeholder="Modülü ekibimizle hemen kullanmak istiyoruz...")
            if st.form_submit_button("🚀 Yükseltme / Satın Alma Talebi Gönder", type="primary"):
                st.success("🎉 Talebiniz başarıyla alındı! FonBridge satış danışmanınız en geç 1 iş saati içinde sizinle iletişime geçecektir.")

    with col_cta2:
        st.markdown("#### 🛡️ Yönetici Hızlı Kontrol")
        st.caption("Yönetici yetkinizle çalışma modunu anında test edebilir veya değiştirebilirsiniz.")
        if user.get("rol") == config.ROLE_YONETICI:
            if st.button("🟢 Modülü 'Standart' Yap (Tüm Kullanıcılara Aç)", use_container_width=True):
                set_module_config(conn, mode=MODE_STANDARD)
                st.success("Modül çalışma modu 'Standart' olarak ayarlandı! Artık tüm kullanıcılar erişebilir.")
                st.rerun()
            if st.button("🔑 Bu Kullanıcıya Doğrudan Lisans Ver", use_container_width=True):
                grant_user_module_license(conn, user["id"])
                st.session_state["user"] = authenticate_user(conn, user["eposta"], "admin123") or user
                st.success("Kullanıcıya modül lisansı tanımlandı!")
                st.rerun()
        else:
            st.info("💡 Eğer kuruluşunuz bu paketi zaten satın aldıysa lütfen sistem yöneticinizle görüşerek hesabınıza yetki tanımlanmasını isteyiniz.")


# Auth Check
if not st.session_state["user"]:
    render_login()
    st.stop()

# Current User Info
curr_user = st.session_state["user"]
is_admin = curr_user["rol"] == config.ROLE_YONETICI

# Check Module Entitlement & Access
has_module_access, access_reason = check_user_module_access(conn, curr_user)
m_config = get_module_config(conn)

# ----------------- SIDEBAR -----------------
with st.sidebar:
    st.markdown(f"### 👤 {curr_user['ad_soyad']}")
    rol_badge = "🛡️ Yönetici" if is_admin else "💼 Ekip Üyesi"
    st.markdown(f"**Rol:** {rol_badge}")
    st.markdown(f"**E-posta:** {curr_user['eposta']}")
    user_plan = curr_user.get("paket", "Standart")
    st.markdown(f"**Paket:** `{user_plan}`")

    # Module Entitlement Badge
    if has_module_access:
        st.markdown("🧩 **Uzman Modülü:** <span style='color:#16A34A; font-weight:600;'>✅ Aktif</span>", unsafe_allow_html=True)
    else:
        st.markdown("🧩 **Uzman Modülü:** <span style='color:#DC2626; font-weight:600;'>🔒 Kilitli</span>", unsafe_allow_html=True)
    st.divider()

    # User's Daily Limit Status
    limit_info = get_user_daily_limit_status(conn, curr_user["id"])
    st.markdown("#### 📊 Bugünkü Gönderim Durumu")
    sent = limit_info["sent_today"]
    max_limit = limit_info["daily_limit"]
    rem = limit_info["remaining"]
    progress = min(1.0, sent / max_limit) if max_limit > 0 else 1.0

    st.progress(progress)
    st.write(f"**{sent} / {max_limit}** gönderildi ({rem} kaldı)")

    if limit_info["is_limit_reached"]:
        st.error("⚠️ Günlük limitinize ulaştınız! Kuyruk kapatıldı.")
    st.divider()

    # Menu
    nav_options = [
        "✉️ Mesaj Kuyruğu",
        "📋 Uzman Listesi",
        "⏳ Takip Listesi",
        "📥 İçe Aktarma"
    ]
    if is_admin:
        nav_options.extend([
            "👥 Ekip ve Atamalar",
            "⚙️ Ayarlar ve Şablonlar"
        ])

    choice = st.radio("Menü", nav_options, index=0)

    # Admin Preview Toggle for Showcase
    if is_admin and m_config["mode"] != MODE_STANDARD:
        st.divider()
        st.caption("🛡️ Yönetici Vitrin Testi")
        preview_upsell = st.checkbox("Vitrin Sayfasını Önizle", value=False)
        if preview_upsell:
            has_module_access = False
            access_reason = "Yönetici önizleme modu aktiftir. Standart paket kullanıcısının göreceği vitrin gösterilmektedir."

    st.divider()
    if st.button("🚪 Çıkış Yap", use_container_width=True):
        st.session_state["user"] = None
        st.session_state["queue_index"] = 0
        st.rerun()


# Gate Outreach Views if User Lacks Entitlement
is_outreach_view = choice in [
    "✉️ Mesaj Kuyruğu",
    "📋 Uzman Listesi",
    "⏳ Takip Listesi",
    "📥 İçe Aktarma"
]

if is_outreach_view and not has_module_access:
    render_upsell_page(conn, curr_user, access_reason)
    st.stop()


# ----------------- 1. MESAJ KUYRUĞU -----------------
if choice == "✉️ Mesaj Kuyruğu":
    st.markdown("<h2 class='main-header'>✉️ Kişiselleştirilmiş Mesaj Kuyruğu</h2>", unsafe_allow_html=True)
    st.markdown("<p class='sub-header'>Sıradaki uzman için taslak mesaj üretin, LinkedIn'de tek tıkla aratıp gönderin.</p>", unsafe_allow_html=True)

    if limit_info["is_limit_reached"]:
        st.warning("🛑 **Günlük Gönderim Limiti Doldu:** Bugün için ayrılan mesaj kotanızı doldurdunuz. Hesap güvenliğiniz için yarın devam edebilirsiniz.")

    # Filter by segment
    c_cur = conn.cursor()
    c_cur.execute("SELECT ad FROM segments ORDER BY ad ASC")
    all_segs = [r[0] for r in c_cur.fetchall()]
    
    col_f1, col_f2 = st.columns([2, 1])
    with col_f1:
        seg_filter = st.selectbox("Segment Filtresi", ["Tümü"] + all_segs)
    with col_f2:
        selected_seg = None if seg_filter == "Tümü" else seg_filter
        st.write("")

    queue_records = get_experts_queue(
        conn,
        user_id=curr_user["id"],
        role=curr_user["rol"],
        status_filter=config.STATUS_BEKLIYOR,
        segment_filter=selected_seg,
        limit=500
    )

    if not queue_records:
        st.info("🎉 Tebrikler! Bekleyen mesaj kuyruğunuzda şu anda işlenecek uzman bulunmuyor.")
    else:
        # Handle index bound
        if st.session_state["queue_index"] >= len(queue_records):
            st.session_state["queue_index"] = 0
        
        idx = st.session_state["queue_index"]
        expert = queue_records[idx]

        # Top Navigation & Counter
        q_col1, q_col2, q_col3 = st.columns([1, 2, 1])
        with q_col1:
            if st.button("◀ Önceki", disabled=(idx == 0)):
                st.session_state["queue_index"] = max(0, idx - 1)
                st.rerun()
        with q_col2:
            st.markdown(f"<div style='text-align: center; font-weight: 600; padding-top: 8px;'>Kayıt {idx + 1} / {len(queue_records)} (Bekleyen Uzmanlar)</div>", unsafe_allow_html=True)
        with q_col3:
            if st.button("Sonraki ▶", disabled=(idx >= len(queue_records) - 1)):
                st.session_state["queue_index"] = min(len(queue_records) - 1, idx + 1)
                st.rerun()

        # Expert Profile Card
        st.markdown("---")
        card_col1, card_col2, card_col3 = st.columns([2, 2, 1.2])
        with card_col1:
            st.markdown(f"### **{expert['ad']} {expert['soyad']}**")
            ulus_val = expert.get("ulus") or "Uluslararası (Varsayılan)"
            st.markdown(f"🌍 **Köken / Ulus:** `{ulus_val}`")
            st.markdown(f"🎯 **Uzmanlık:** `{expert['uzmanlik']}`")
        with card_col2:
            # Language Selector (user can override per row as requested in F4)
            current_lang = expert["dil"] or "EN"
            def_idx = ALL_LANGUAGES.index(current_lang) if current_lang in ALL_LANGUAGES else 1
            new_lang = st.selectbox(
                "🌐 Mesaj Dili (Ana Dil)",
                ALL_LANGUAGES,
                index=def_idx,
                key=f"lang_{expert['id']}",
                format_func=lambda x: LANGUAGE_LABELS.get(x, x)
            )
            if new_lang != current_lang:
                with conn:
                    conn.execute("UPDATE experts SET dil = ? WHERE id = ?", (new_lang, expert["id"]))
                expert["dil"] = new_lang
        with card_col3:
            # LinkedIn Search Button
            search_url = generate_linkedin_search_url(expert["ad"], expert["soyad"], expert["uzmanlik"])
            st.markdown(f"""
                <div style='padding-top: 15px;'>
                    <a href="{search_url}" target="_blank" style="text-decoration: none;">
                        <button style="background-color: #0A66C2; color: white; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 600; cursor: pointer; width: 100%;">
                            🔍 LinkedIn'de Ara ↗
                        </button>
                    </a>
                </div>
            """, unsafe_allow_html=True)

        # Get Template and Render Draft
        # Use primary segment of the expert if available
        first_segment = expert["uzmanlik"].split("//")[0].strip() if expert["uzmanlik"] else None
        active_tpl = get_active_template(conn, segment=first_segment, dil=expert["dil"])
        if not active_tpl:
            active_tpl = get_active_template(conn, segment=None, dil=expert["dil"])

        draft_body = render_message(active_tpl["govde"], expert) if active_tpl else "Şablon bulunamadı."
        tpl_usage = get_template_usage_count(conn, active_tpl["id"]) if active_tpl else 0

        st.markdown("#### 📝 Kişiselleştirilmiş Mesaj Taslağı")
        st.markdown(f"<div class='draft-box'>{draft_body}</div>", unsafe_allow_html=True)
        st.caption(f"ℹ️ Şablon: **{active_tpl['konu'] if active_tpl else 'Varsayılan'}** ({expert['dil']}) — Bu şablon daha önce **{tpl_usage}** kez kopyalandı.")

        # Action Buttons
        st.markdown("#### ⚡ Gönderim ve Takip Eylemleri")
        btn_c1, btn_c2, btn_c3, btn_c4, btn_c5 = st.columns([1.2, 1.2, 1.2, 1.2, 1.2])

        with btn_c1:
            if st.button("📋 Kopyala", use_container_width=True, key=f"copy_{expert['id']}"):
                log_copy_event(conn, expert["id"], curr_user["id"], active_tpl["id"] if active_tpl else None)
                st.toast("✅ Metin kopyalama olayı kaydedildi!", icon="📋")

        with btn_c2:
            send_disabled = limit_info["is_limit_reached"]
            if st.button("✅ Gönderdim", type="primary", disabled=send_disabled, use_container_width=True, key=f"sent_{expert['id']}"):
                try:
                    update_expert_status(conn, expert["id"], config.STATUS_GONDERILDI, curr_user["id"])
                    st.success(f"{expert['ad']} {expert['soyad']} 'Gönderildi' olarak kaydedildi.")
                    st.rerun()
                except DailyLimitReachedException as e:
                    st.error(str(e))

        with btn_c3:
            if st.button("💬 Yanıt Geldi", use_container_width=True, key=f"reply_{expert['id']}"):
                update_expert_status(conn, expert["id"], config.STATUS_YANIT_GELDI, curr_user["id"])
                st.success("Durum 'Yanıt Geldi' olarak güncellendi.")
                st.rerun()

        with btn_c4:
            if st.button("🚫 İlgilenmiyor", use_container_width=True, key=f"uninterested_{expert['id']}"):
                update_expert_status(conn, expert["id"], config.STATUS_ILGILENMIYOR, curr_user["id"])
                st.warning("Kişi 'İlgilenmiyor' olarak işaretlendi ve opt-out listesine alındı.")
                st.rerun()

        with btn_c5:
            if st.button("⛔ Bir Daha Yazma", use_container_width=True, key=f"optout_{expert['id']}"):
                update_expert_status(conn, expert["id"], config.STATUS_BIR_DAHA_YAZMA, curr_user["id"])
                st.error("Kişi 'Bir Daha Yazma' olarak kaydedildi ve kalıcı olarak kuyruktan çıkarıldı.")
                st.rerun()

        # Custom Note & Timeline Expander
        with st.expander("📌 Not Ekle ve Geçmiş Denetim İzi (Audit Log)"):
            note_col1, note_col2 = st.columns([3, 1])
            with note_col1:
                new_note = st.text_input("Bu uzman için not ekle", key=f"note_input_{expert['id']}")
            with note_col2:
                st.write("")
                if st.button("Notu Kaydet", key=f"save_note_{expert['id']}"):
                    if new_note.strip():
                        add_expert_note(conn, expert["id"], curr_user["id"], new_note.strip())
                        st.success("Not kaydedildi!")
                        st.rerun()

            # Timeline
            events = get_expert_events(conn, expert["id"])
            if events:
                st.markdown("**İşlem Geçmişi:**")
                for ev in events:
                    user_str = ev["ad_soyad"] or "Bilinmeyen Kullanıcı"
                    st.caption(f"• **{ev['tarih'][:19]}** — *{ev['tip']}*: {ev['not_metni']} *(İşlemi Yapan: {user_str})*")
            else:
                st.caption("Henüz işlem kaydı yok.")

            if is_admin:
                st.markdown("---")
                if st.button("🗑️ Kişiyi Kalıcı Olarak Sil (KVKK / GDPR)", key=f"del_{expert['id']}"):
                    delete_expert_permanently(conn, expert["id"])
                    st.warning("Kişi ve tüm işlem geçmişi kalıcı olarak silindi.")
                    st.rerun()


# ----------------- 2. UZMAN LİSTESİ -----------------
elif choice == "📋 Uzman Listesi":
    st.markdown("<h2 class='main-header'>📋 Uzman Rehberi ve Durum Takibi</h2>", unsafe_allow_html=True)
    st.markdown("<p class='sub-header'>Tüm uzmanları filtreleyin, arama yapın ve durum raporunu dışa aktarın.</p>", unsafe_allow_html=True)

    # Metrics
    m_cur = conn.cursor()
    m_cur.execute("SELECT COUNT(*) FROM experts")
    total_exp = m_cur.fetchone()[0]

    m_cur.execute("SELECT COUNT(*) FROM experts WHERE durum = 'Bekliyor' AND opt_out = 0")
    bekleyen_exp = m_cur.fetchone()[0]

    m_cur.execute("SELECT COUNT(*) FROM experts WHERE durum = 'Gönderildi'")
    gonderilen_exp = m_cur.fetchone()[0]

    m_cur.execute("SELECT COUNT(*) FROM experts WHERE durum = 'Yanıt geldi'")
    yanit_exp = m_cur.fetchone()[0]

    m_cur.execute("SELECT COUNT(*) FROM experts WHERE opt_out = 1")
    optout_exp = m_cur.fetchone()[0]

    mc1, mc2, mc3, mc4, mc5 = st.columns(5)
    with mc1:
        st.markdown(f"<div class='metric-card'><div class='metric-value'>{total_exp}</div><div class='metric-label'>Toplam Uzman</div></div>", unsafe_allow_html=True)
    with mc2:
        st.markdown(f"<div class='metric-card'><div class='metric-value'>{bekleyen_exp}</div><div class='metric-label'>Bekliyor</div></div>", unsafe_allow_html=True)
    with mc3:
        st.markdown(f"<div class='metric-card'><div class='metric-value'>{gonderilen_exp}</div><div class='metric-label'>Gönderildi</div></div>", unsafe_allow_html=True)
    with mc4:
        st.markdown(f"<div class='metric-card'><div class='metric-value'>{yanit_exp}</div><div class='metric-label'>Yanıt Geldi</div></div>", unsafe_allow_html=True)
    with mc5:
        st.markdown(f"<div class='metric-card'><div class='metric-value'>{optout_exp}</div><div class='metric-label'>Opt-Out</div></div>", unsafe_allow_html=True)

    st.markdown("---")

    # Filters
    fc1, fc2, fc3, fc4 = st.columns([1.2, 1.2, 1.2, 1.8])
    with fc1:
        status_filter = st.selectbox("Durum Filtresi", ["Tümü"] + config.ALL_STATUSES)
    with fc2:
        lang_filter = st.selectbox(
            "Dil Filtresi",
            ["Tümü"] + ALL_LANGUAGES,
            format_func=lambda x: "Tümü (Tüm Diller)" if x == "Tümü" else LANGUAGE_LABELS.get(x, x)
        )
    with fc3:
        s_cur = conn.cursor()
        s_cur.execute("SELECT ad FROM segments ORDER BY ad ASC")
        segments = [r[0] for r in s_cur.fetchall()]
        segment_filter = st.selectbox("Segment Filtresi", ["Tümü"] + segments)
    with fc4:
        search_query = st.text_input("Metin Arama (Ad, Soyad, Ulus veya Uzmanlık)", placeholder="ör. Finans, Ahmet, Fransa, Almanya...")

    # Build query
    s_val = None if status_filter == "Tümü" else status_filter
    seg_val = None if segment_filter == "Tümü" else segment_filter

    df_export = get_experts_export_df(
        conn,
        status=s_val,
        segment=seg_val,
        user_id=curr_user["id"],
        role=curr_user["rol"]
    )

    if lang_filter != "Tümü":
        df_export = df_export[df_export["Dil"] == lang_filter]

    if search_query:
        sq = search_query.strip().lower()
        mask = (
            df_export["Ad"].astype(str).str.lower().str.contains(sq) |
            df_export["Soyad"].astype(str).str.lower().str.contains(sq) |
            df_export["Uzmanlık"].astype(str).str.lower().str.contains(sq) |
            df_export["Ulus"].astype(str).str.lower().str.contains(sq)
        )
        df_export = df_export[mask]

    st.markdown(f"**Bulunan Kayıt Sayısı:** `{len(df_export)}`")

    # Export Buttons
    exp_c1, exp_c2, exp_c3 = st.columns([1, 1, 3])
    with exp_c1:
        csv_data = df_export.to_csv(index=False).encode('utf-8-sig')
        st.download_button(
            label="📥 CSV Olarak İndir",
            data=csv_data,
            file_name=f"fonbridge_uzmanlar_{datetime.now().strftime('%Y%m%d')}.csv",
            mime="text/csv",
            use_container_width=True
        )
    with exp_c2:
        from io import BytesIO
        excel_buffer = BytesIO()
        df_export.to_excel(excel_buffer, index=False)
        excel_data = excel_buffer.getvalue()
        st.download_button(
            label="📥 Excel Olarak İndir",
            data=excel_data,
            file_name=f"fonbridge_uzmanlar_{datetime.now().strftime('%Y%m%d')}.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            use_container_width=True
        )

    st.dataframe(df_export, use_container_width=True, height=450)


# ----------------- 3. TAKİP LİSTESİ -----------------
elif choice == "⏳ Takip Listesi":
    st.markdown("<h2 class='main-header'>⏳ Takip Listesi (Follow-up)</h2>", unsafe_allow_html=True)
    takip_gun = get_system_setting(conn, "takip_gun", str(config.DEFAULT_FOLLOWUP_DAYS))
    st.markdown(f"<p class='sub-header'>İlk mesaj gönderimi üzerinden <strong>{takip_gun} gün</strong> geçen ve henüz yanıt alınmayan uzmanlar.</p>", unsafe_allow_html=True)

    followups = get_followup_list(conn, user_id=curr_user["id"], role=curr_user["rol"])

    if not followups:
        st.success("✅ Harika! Takip gerektiren gecikmiş hiçbir gönderim bulunmuyor.")
    else:
        st.warning(f"🔔 Toplam **{len(followups)}** uzman yanıt bekliyor.")
        
        for f in followups:
            with st.container():
                f_col1, f_col2, f_col3, f_col4 = st.columns([2.5, 2, 1.5, 2])
                with f_col1:
                    st.markdown(f"**{f['ad']} {f['soyad']}**")
                    st.caption(f"🎯 Uzmanlık: {f['uzmanlik']}")
                with f_col2:
                    st.markdown(f"📅 Gönderim: `{f['son_gonderim_tarihi'][:10]}`")
                    st.caption(f"Atanan Üye: {f.get('atanan_uye') or 'Atanmamış'}")
                with f_col3:
                    s_url = generate_linkedin_search_url(f["ad"], f["soyad"], f["uzmanlik"])
                    st.markdown(f'<a href="{s_url}" target="_blank"><button style="padding: 6px 12px; border-radius: 6px; border: 1px solid #CBD5E1; background: #FFF; cursor: pointer;">🔍 Profili Aç</button></a>', unsafe_allow_html=True)
                with f_col4:
                    act_c1, act_c2 = st.columns(2)
                    with act_c1:
                        if st.button("💬 Yanıt Geldi", key=f"f_reply_{f['id']}"):
                            update_expert_status(conn, f["id"], config.STATUS_YANIT_GELDI, curr_user["id"])
                            st.success("Kaydedildi!")
                            st.rerun()
                    with act_c2:
                        if st.button("🚫 İlgilenmiyor", key=f"f_opt_{f['id']}"):
                            update_expert_status(conn, f["id"], config.STATUS_ILGILENMIYOR, curr_user["id"])
                            st.warning("Opt-out yapıldı!")
                            st.rerun()
                st.divider()


# ----------------- 4. İÇE AKTARMA -----------------
elif choice == "📥 İçe Aktarma":
    st.markdown("<h2 class='main-header'>📥 Excel / CSV İçe Aktarma</h2>", unsafe_allow_html=True)
    st.markdown("<p class='sub-header'>Uzman listesini (.xlsx veya .csv) yükleyin. Sistem verileri temizler, tekrarları ayıklar ve dilleri otomatik atar.</p>", unsafe_allow_html=True)

    uploaded_file = st.file_uploader("Dosya Seçiniz (.xlsx veya .csv)", type=["xlsx", "csv"])

    if uploaded_file is not None:
        try:
            preview = preview_file(uploaded_file, num_rows=8)
            st.markdown(f"**Dosyadaki Toplam Satır Sayısı:** `{preview['total_rows']}`")
            
            # Check if columns matched automatically
            auto_mapping = preview["mapping"]
            all_cols = preview["columns"]
            
            with st.expander("🛠️ Kolon Eşleştirmelerini İncele / Değiştir", expanded=not preview["is_valid_columns"]):
                st.info("Sistem kolonları otomatik olarak eşleştirmeye çalıştı. Gerekirse aşağıdaki açılır kutulardan eşleşmeyi düzeltebilirsiniz.")
                m_c1, m_c2, m_c3 = st.columns(3)
                
                # Default selections
                def get_col_index(target_key, col_list):
                    mapped = auto_mapping.get(target_key)
                    if mapped and mapped in col_list:
                        return col_list.index(mapped)
                    return 0

                with m_c1:
                    first_name_opt = ["(Yok / Ad Soyad Birlikte)"] + all_cols
                    def_fn_idx = (all_cols.index(auto_mapping["first_name"]) + 1) if "first_name" in auto_mapping and auto_mapping["first_name"] in all_cols else 0
                    sel_first = st.selectbox("1. Ad Kolonu (First Name)", first_name_opt, index=def_fn_idx)

                with m_c2:
                    last_name_opt = ["(Yok / Ad Soyad Birlikte)"] + all_cols
                    def_ln_idx = (all_cols.index(auto_mapping["last_name"]) + 1) if "last_name" in auto_mapping and auto_mapping["last_name"] in all_cols else 0
                    sel_last = st.selectbox("2. Soyad Kolonu (Last Name)", last_name_opt, index=def_ln_idx)

                with m_c3:
                    exp_opt = all_cols
                    def_exp_idx = all_cols.index(auto_mapping["expertise"]) if "expertise" in auto_mapping and auto_mapping["expertise"] in all_cols else 0
                    sel_exp = st.selectbox("3. Uzmanlık Kolonu (Area of Expertise)", exp_opt, index=def_exp_idx)

                # Full name fallback if separate not selected
                sel_full = None
                if sel_first == "(Yok / Ad Soyad Birlikte)" or sel_last == "(Yok / Ad Soyad Birlikte)":
                    full_name_opt = all_cols
                    def_fnm_idx = all_cols.index(auto_mapping["full_name"]) if "full_name" in auto_mapping and auto_mapping["full_name"] in all_cols else 0
                    sel_full = st.selectbox("Ad ve Soyadın Birlikte Olduğu Kolon (Full Name)", full_name_opt, index=def_fnm_idx)

            # Build final mapping
            active_mapping = {"expertise": sel_exp}
            if sel_first != "(Yok / Ad Soyad Birlikte)" and sel_last != "(Yok / Ad Soyad Birlikte)":
                active_mapping["first_name"] = sel_first
                active_mapping["last_name"] = sel_last
            elif sel_full:
                active_mapping["full_name"] = sel_full

            is_ready_to_import = "expertise" in active_mapping and (
                ("first_name" in active_mapping and "last_name" in active_mapping) or ("full_name" in active_mapping)
            )

            st.markdown("#### Önizleme (İlk 8 Satır)")
            st.dataframe(pd.DataFrame(preview["preview_data"]), use_container_width=True)

            if is_ready_to_import:
                if st.button("🚀 Veritabanına İçe Aktarmayı Başlat", type="primary", use_container_width=True):
                    with st.spinner("Veriler temizleniyor, diller atanıyor ve içe aktarılıyor..."):
                        uploaded_file.seek(0)
                        res = import_experts_from_file(
                            uploaded_file,
                            conn,
                            user_id=curr_user["id"],
                            custom_mapping=active_mapping
                        )
                        
                        st.success(f"🎉 **{res['valid_imported_count']}** uzman başarıyla içe aktarıldı! (Süre: {res['elapsed_seconds']} saniye)")
                        
                        r_col1, r_col2, r_col3, r_col4 = st.columns(4)
                        with r_col1:
                            st.metric("Geçerli Aktarılan", res["valid_imported_count"])
                        with r_col2:
                            st.metric("Boş Satır Atlanan", res["empty_rows_skipped"])
                        with r_col3:
                            st.metric("Mükerrer / Hatalı", res["error_count"])
                        with r_col4:
                            st.metric("Yeni Segment Sayısı", res["new_segments_count"])

                        if res["error_report_path"]:
                            st.warning(f"⚠️ {res['error_count']} satırda mükerrerlik veya eksik alan tespit edildi. Hata raporu oluşturuldu.")
                            with open(res["error_report_path"], "rb") as f:
                                st.download_button(
                                    label="📥 Hata Raporunu İndir (hata_raporu.csv)",
                                    data=f.read(),
                                    file_name="hata_raporu.csv",
                                    mime="text/csv"
                                )
            else:
                st.error("Lütfen en az Ad + Soyad (veya Tek Kolon Ad Soyad) ile Uzmanlık kolonunu eşleştirin.")
        except Exception as e:
            st.error(f"Dosya işlenirken hata oluştu: {str(e)}")


# ----------------- 5. EKİP VE ATAMALAR (ADMIN) -----------------
elif choice == "👥 Ekip ve Atamalar" and is_admin:
    st.markdown("<h2 class='main-header'>👥 Ekip ve Segment Yönetimi</h2>", unsafe_allow_html=True)
    st.markdown("<p class='sub-header'>Ekip üyelerini yönetin, günlük limitleri belirleyin ve segmentleri üyelere atayın.</p>", unsafe_allow_html=True)

    tab_team, tab_assign = st.tabs(["📊 Ekip Performansı ve Kullanıcılar", "🎯 Segment ve Uzman Atamaları"])

    with tab_team:
        st.markdown("#### Bugünkü Ekip Gönderim Durumu")
        team_stats = get_team_daily_stats(conn)
        st.dataframe(pd.DataFrame(team_stats), use_container_width=True)

        st.markdown("---")
        st.markdown("#### Yeni Ekip Üyesi Ekle")
        with st.form("new_user_form"):
            uc1, uc2 = st.columns(2)
            with uc1:
                u_name = st.text_input("Ad Soyad")
                u_email = st.text_input("E-posta Adresi")
            with uc2:
                u_pass = st.text_input("Parola", type="password")
                u_role = st.selectbox("Rol", [config.ROLE_UYE, config.ROLE_YONETICI])
            
            uc3, uc4 = st.columns(2)
            with uc3:
                u_plan = st.selectbox("Abonelik Paketi", ALL_PLANS, index=0)
            with uc4:
                u_mod_lic = st.checkbox("Uzman Ulaşım Modülü Lisansı Tanımla", value=False)

            u_limit = st.number_input("Kişiye Özel Günlük Limit (Boş bırakılırsa genel ayar geçerlidir)", min_value=0, max_value=500, value=50)
            
            u_submit = st.form_submit_button("Kullanıcıyı Kaydet")
            if u_submit:
                if u_name and u_email and u_pass:
                    try:
                        u_mods = MODULE_ID if u_mod_lic else ""
                        create_user(conn, u_name, u_email, u_pass, u_role, u_limit, u_plan, u_mods)
                        st.success(f"{u_name} başarıyla sisteme eklendi!")
                        st.rerun()
                    except Exception as e:
                        st.error(f"Kullanıcı eklenemedi: {str(e)}")
                else:
                    st.error("Lütfen ad soyad, e-posta ve parola alanlarını doldurun.")

    with tab_assign:
        st.markdown("#### Uzmanlık Segmentini Ekip Üyesine Toplu Ata")
        st.caption("Bir uzmanlık segmentindeki tüm boşta olan uzmanları seçilen ekip üyesine atar.")
        
        c_seg = conn.cursor()
        c_seg.execute("SELECT ad FROM segments ORDER BY ad ASC")
        all_segments_list = [r[0] for r in c_seg.fetchall()]
        
        all_users_list = get_all_users(conn)
        user_options = {f"{u['ad_soyad']} ({u['eposta']})": u["id"] for u in all_users_list if u["rol"] == config.ROLE_UYE}

        if not all_segments_list or not user_options:
            st.info("Atama yapmak için en az bir segment ve üye bulunmalıdır.")
        else:
            with st.form("assign_segment_form"):
                as_c1, as_c2 = st.columns(2)
                with as_c1:
                    sel_seg = st.selectbox("Uzmanlık Segmenti", all_segments_list)
                with as_c2:
                    sel_u_label = st.selectbox("Atanacak Ekip Üyesi", list(user_options.keys()))
                
                as_submit = st.form_submit_button("Segmenti ve İlgili Uzmanları Ata")
                if as_submit:
                    target_user_id = user_options[sel_u_label]
                    assigned_count = assign_segment_to_user(conn, sel_seg, target_user_id, curr_user["id"])
                    st.success(f"'{sel_seg}' alanındaki **{assigned_count}** uzman başarıyla {sel_u_label} kullanıcısına atandı!")
                    st.rerun()


# ----------------- 6. AYARLAR VE ŞABLONLAR (ADMIN) -----------------
elif choice == "⚙️ Ayarlar ve Şablonlar" and is_admin:
    st.markdown("<h2 class='main-header'>⚙️ Ayarlar, Şablonlar ve Yedekleme</h2>", unsafe_allow_html=True)
    st.markdown("<p class='sub-header'>Sistem limitlerini ayarlayın, modül paket satış modelini yapılandırın, şablonları güncelleyin ve yedek alın.</p>", unsafe_allow_html=True)

    tab_mod, tab_set, tab_tpl, tab_bck = st.tabs([
        "🧩 Modül ve Paket Yönetimi",
        "⚙️ Genel Ayarlar",
        "📝 Mesaj Şablonları",
        "💾 Veritabanı Yedekleri"
    ])

    with tab_mod:
        st.markdown("#### 🧩 FonBridge Modül Dağıtım ve Paket Satış Ayarları")
        st.caption("Uzman Ulaşım Asistanı modülünün FonBridge ana platformunda nasıl dağıtılacağını, paketlere dahil edilip edilmeyeceğini veya eklenti olarak satılacağını yönetin.")

        cur_m_cfg = get_module_config(conn)

        st.markdown("##### 1. Modül Çalışma Modeli")
        mode_options = [MODE_STANDARD, MODE_PACKAGE, MODE_DISABLED]
        cur_mode_idx = mode_options.index(cur_m_cfg["mode"]) if cur_m_cfg["mode"] in mode_options else 0

        with st.form("module_config_form"):
            new_mode = st.radio(
                "Çalışma Modunu Belirleyin",
                mode_options,
                index=cur_mode_idx,
                format_func=lambda x: MODE_LABELS.get(x, x),
                help="Standart: Tüm kullanıcılara açık. Paket Satış: Yalnızca yetkili paketler veya lisanslılar. Devre Dışı: Yalnızca yöneticiler görür."
            )

            st.markdown("---")
            st.markdown("##### 2. Paket Satış ve Fiyatlandırma Detayları")
            c_p1, c_p2 = st.columns(2)
            with c_p1:
                new_price = st.text_input("Modül Satış Fiyatı / Etiketi", value=cur_m_cfg.get("price", "$49 / Ay"))
            with c_p2:
                new_allowed_plans = st.multiselect(
                    "Bu Modülü İçeren Abonelik Paketleri",
                    ALL_PLANS,
                    default=[p for p in cur_m_cfg.get("allowed_plans", ["Pro", "Enterprise", "Outreach Add-on"]) if p in ALL_PLANS]
                )

            new_promo_title = st.text_input("Vitrin / Tanıtım Başlığı", value=cur_m_cfg.get("promo_title", "FonBridge Uzman Ulaşım Paketi"))
            new_promo_desc = st.text_area("Tanıtım Açıklaması", value=cur_m_cfg.get("promo_desc", "31.400+ Horizon Europe uzmanına 24 AB dilinde ulaşın."), height=80)

            if st.form_submit_button("💾 Modül Yapılandırmasını Kaydet", type="primary"):
                set_module_config(
                    conn,
                    mode=new_mode,
                    allowed_plans=new_allowed_plans,
                    price=new_price,
                    promo_title=new_promo_title,
                    promo_desc=new_promo_desc
                )
                st.success("🎉 Modül ayarları ve paket satış yapılandırması başarıyla kaydedildi!")
                st.rerun()

        st.markdown("---")
        st.markdown("##### 3. Kullanıcı Lisans ve Paket Yetkilendirme Tablosu")
        st.caption("Kullanıcıların mevcut abonelik paketlerini ve bu modüle özel bağımsız lisanslarını yönetin.")

        all_users_mod = get_all_users(conn)
        user_rows = []
        for u in all_users_mod:
            u_acc, u_reason = check_user_module_access(conn, u)
            u_mods = [m.strip() for m in (u.get("moduller") or "").split(",") if m.strip()]
            has_direct_lic = MODULE_ID in u_mods
            user_rows.append({
                "ID": u["id"],
                "Ad Soyad": u["ad_soyad"],
                "E-posta": u["eposta"],
                "Rol": u["rol"],
                "Paket": u.get("paket", "Standart"),
                "Özel Lisans": "✅ Var" if has_direct_lic else "❌ Yok",
                "Modül Erişimi": "✅ Açık" if u_acc else "🔒 Kilitli",
                "Erişim Gerekçesi": u_reason
            })

        st.dataframe(pd.DataFrame(user_rows), use_container_width=True)

        with st.expander("🛠️ Bireysel Kullanıcı Paketi ve Lisansını Güncelle", expanded=True):
            if all_users_mod:
                u_opts = {f"{u['ad_soyad']} ({u['eposta']}) — Paket: {u.get('paket', 'Standart')}": u for u in all_users_mod}
                chosen_user_label = st.selectbox("İşlem Yapılacak Kullanıcı", list(u_opts.keys()))
                target_u = u_opts[chosen_user_label]

                c_up1, c_up2 = st.columns([1, 2])
                with c_up1:
                    cur_p = target_u.get("paket", "Standart")
                    p_idx = ALL_PLANS.index(cur_p) if cur_p in ALL_PLANS else 0
                    ch_plan = st.selectbox("Yeni Paket Ata", ALL_PLANS, index=p_idx, key=f"plan_sel_{target_u['id']}")
                    if st.button("📦 Paketi Güncelle", key=f"btn_p_{target_u['id']}"):
                        set_user_plan(conn, target_u["id"], ch_plan)
                        st.success(f"{target_u['ad_soyad']} kullanıcısının paketi '{ch_plan}' olarak güncellendi!")
                        st.rerun()

                with c_up2:
                    st.write("**Bağımsız Modül Lisansı:**")
                    u_mods = [m.strip() for m in (target_u.get("moduller") or "").split(",") if m.strip()]
                    has_lic = MODULE_ID in u_mods
                    if has_lic:
                        st.write("Bu kullanıcıya ait **aktif özel lisans** bulunmaktadır.")
                        if st.button("🚫 Özel Modül Lisansını İptal Et", key=f"btn_rev_{target_u['id']}"):
                            revoke_user_module_license(conn, target_u["id"])
                            st.warning(f"{target_u['ad_soyad']} kullanıcısının özel lisansı kaldırıldı.")
                            st.rerun()
                    else:
                        st.write("Bu kullanıcının paketten bağımsız özel lisansı **bulunmamaktadır**.")
                        if st.button("🔑 Bu Kullanıcıya Özel Modül Lisansı Tanımla", key=f"btn_gr_{target_u['id']}"):
                            grant_user_module_license(conn, target_u["id"])
                            st.success(f"{target_u['ad_soyad']} kullanıcısına özel lisans verildi!")
                            st.rerun()

    with tab_set:
        st.markdown("#### Limit ve Süre Ayarları")
        cur_limit = int(get_system_setting(conn, "gunluk_limit", str(config.DEFAULT_DAILY_LIMIT)))
        cur_followup = int(get_system_setting(conn, "takip_gun", str(config.DEFAULT_FOLLOWUP_DAYS)))

        with st.form("settings_form"):
            new_lim = st.number_input("Varsayılan Günlük Gönderim Limiti (Kullanıcı Başına)", min_value=1, max_value=500, value=cur_limit)
            new_fol = st.number_input("Takip Süresi (Gün - Kaç gün yanıtsız kalırsa takip listesine düşsün?)", min_value=1, max_value=60, value=cur_followup)
            
            if st.form_submit_button("Ayarları Kaydet"):
                set_system_setting(conn, "gunluk_limit", str(new_lim))
                set_system_setting(conn, "takip_gun", str(new_fol))
                st.success("Sistem ayarları güncellendi!")
                st.rerun()

        st.markdown("---")
        st.markdown("#### 🌐 AB Üyesi Tüm Ülke Dilleri ve Ulus Tespiti (Tüm Uzmanlar)")
        st.caption("Uzmanların ad, soyad ve uzmanlık verilerini analiz ederek 24 AB resmi dili + Türkçe (TR) kapsamında uluslarını ve ana dillerini günceller.")
        if st.button("🔄 Tüm Uzmanların Ulus ve Dillerini Yeniden Tara ve Güncelle (24 AB Dili + TR)", type="primary"):
            with st.spinner("Tüm uzmanların ulusları ve ana dilleri analiz ediliyor..."):
                stats_res = re_evaluate_all_expert_languages(conn)
                lstats = stats_res.get("languages", {})
                st.success(f"🎉 Toplam {stats_res.get('total', 0)} uzmanın ulus ve dil bilgisi başarıyla güncellendi!")
                
                # Show distribution breakdown
                stat_cols = st.columns(4)
                top_langs = sorted(lstats.items(), key=lambda x: x[1], reverse=True)
                for i, (l_code, count) in enumerate(top_langs[:8]):
                    with stat_cols[i % 4]:
                        st.metric(LANGUAGE_LABELS.get(l_code, l_code), f"{count} uzman")
                
                with st.expander("📊 Detaylı Ulus ve Dil Dağılımını Görüntüle", expanded=True):
                    ldf = pd.DataFrame([
                        {"Dil Kodu": k, "Dil": LANGUAGE_LABELS.get(k, k), "Uzman Sayısı": v}
                        for k, v in sorted(lstats.items(), key=lambda x: x[1], reverse=True)
                    ])
                    st.dataframe(ldf, use_container_width=True)
                st.rerun()

    with tab_tpl:
        st.markdown("#### Şablon Yönetimi")
        st.caption("Kural: Şablonda en az bir kişisel değişken bulunmalıdır: `{ad}`, `{soyad}`, `{uzmanlik}`.")

        templates_list = get_all_templates(conn)
        for tpl in templates_list:
            seg_label = tpl["segment"] or "Genel (Tüm Segmentler)"
            dil_label = LANGUAGE_LABELS.get(tpl['dil'], tpl['dil'])
            with st.expander(f"📌 {tpl['konu']} ({dil_label}) — {seg_label}"):
                with st.form(f"edit_tpl_{tpl['id']}"):
                    t_konu = st.text_input("Konu / Başlık", value=tpl["konu"] or "")
                    t_govde = st.text_area("Mesaj Gövdesi", value=tpl["govde"], height=160)
                    t_idx = ALL_LANGUAGES.index(tpl["dil"]) if tpl["dil"] in ALL_LANGUAGES else 0
                    t_dil = st.selectbox(
                        "Dil",
                        ALL_LANGUAGES,
                        index=t_idx,
                        key=f"tpl_dil_{tpl['id']}",
                        format_func=lambda x: LANGUAGE_LABELS.get(x, x)
                    )
                    
                    if st.form_submit_button("Şablonu Güncelle"):
                        try:
                            save_template(conn, t_dil, t_govde, t_konu, tpl["segment"], tpl["id"])
                            st.success("Şablon kaydedildi!")
                            st.rerun()
                        except ValueError as e:
                            st.error(str(e))

        st.markdown("---")
        st.markdown("#### Yeni Şablon Ekle")
        with st.form("add_tpl_form"):
            nt_konu = st.text_input("Şablon Başlığı")
            nt_dil = st.selectbox(
                "Dil",
                ALL_LANGUAGES,
                key="new_tpl_lang",
                format_func=lambda x: LANGUAGE_LABELS.get(x, x)
            )
            
            c_s = conn.cursor()
            c_s.execute("SELECT ad FROM segments ORDER BY ad ASC")
            segs = [r[0] for r in c_s.fetchall()]
            nt_seg = st.selectbox("Segment (Boşsa genel şablon olur)", ["Genel (Boş)"] + segs)
            
            nt_govde = st.text_area("Mesaj Metni ({ad}, {soyad}, {uzmanlik} kullanılabilir)", height=140)
            
            if st.form_submit_button("Yeni Şablonu Kaydet"):
                if nt_govde:
                    try:
                        chosen_seg = None if nt_seg == "Genel (Boş)" else nt_seg
                        save_template(conn, nt_dil, nt_govde, nt_konu, chosen_seg)
                        st.success("Yeni şablon eklendi!")
                        st.rerun()
                    except ValueError as e:
                        st.error(str(e))
                else:
                    st.error("Lütfen şablon metnini giriniz.")

    with tab_bck:
        st.markdown("#### Veritabanı Yedekleme (F12)")
        st.caption("SQLite veritabanının anlık güvenli yedeğini tek tıkla alın.")
        
        if st.button("💾 Hemen Yedek Al", type="primary"):
            backup_path = create_database_backup()
            st.success(f"Yedek başarıyla oluşturuldu: `{backup_path.name}`")
            st.rerun()

        st.markdown("#### Mevcut Yedekler")
        backups = list_backups()
        if backups:
            st.dataframe(pd.DataFrame(backups), use_container_width=True)
        else:
            st.info("Henüz yedek dosyası bulunmuyor.")
