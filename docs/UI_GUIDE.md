# UI_GUIDE.md — Arayüz ilkeleri ve tasarım tokenleri

## İlkeler
1. **Özet önce, ayrıntı sonra:** her liste sayfasının üstünde 3–5 sayısal özet (KPI tile) ve durum rozetleri; renk anlam taşır (yeşil geçti, kehribar son tarih yaklaşıyor, kırmızı uygun değil/eşik altı).
2. **Kapı ve durum her yerde görünür:** fırsat kartında `G2` rozeti; modül menüsünde `pilot` rozeti.
3. **Konu kimlikleri monospace:** `HORIZON-CL5-2026-09-D4-01` gibi tanımlayıcılar `IBM Plex Mono`.
4. **Tarihler iki saatte:** kullanıcı saat dilimi + Brüksel saati (`15 Eyl 2026 18:00 (17:00 CET)`).
5. **YZ çıktısı taslak:** üstte "YZ taslağı — düzenleyin" şeridi; kaynak/kanıt bağlantıları görünür.
6. **Boş durumlar öğretici:** her modülün boş ekranı "ilk adım" içerir (örn. M1: "Bir konu öneki yazın").

## Tokenler (Tailwind `theme.extend`)
- Renk: `ink #1C2733`, `ink-2 #4B5A68`, `muted #75838F`, `line #D5DCE3`, `ground #F4F6F8`, `surface #FFFFFF`, `accent #0E7A83`, `accent-ink #0A5C63`, `amber #B7791F`, `ok #2F7D4F`, `bad #B4453A`. Koyu tema: `ground #0F161C`, `surface #17222B`, `ink #E6ECF1`, `accent #3FB8C1`.
- Yazı: başlık `Newsreader` (serif, 500), gövde `Public Sans`, mono `IBM Plex Mono`; ölçek 12/13.5/15/17/22/30/40.
- Boşluk: 4'lük ızgara; kart içi 16; bölümler arası 32.
- Bileşenler: shadcn/ui üzerine `StatusPill`, `GateBadge`, `ModuleSwitch`, `DeadlineChip`, `EvidenceDrawer`, `TopicIdText`.

## Ana ekranlar (MVP)
Dashboard · Çağrılar (liste/detay) · Pipeline (kanban/detay/takvim) · Ortaklar (arama/kart/liderler) · İlişkiler · Kanıtlar · Concept Note editörü · Eşleştirme · Ayarlar (modüller, kapılar, faturalama, ekip, profil) · Platform admin.
