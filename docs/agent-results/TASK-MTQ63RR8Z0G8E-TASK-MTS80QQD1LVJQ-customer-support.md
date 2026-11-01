# Bağımsız Görsel ve Etkileşimli Doğrulama Raporu: TASK-MTQ63RR8Z0G8E ve TASK-MTS80QQD1LVJQ

**Ajan:** customer-support (Görsel Audit / Customer Support)  
**Tarih:** 2026-09-08  
**Sprint:** SPRINT-S12  
**Doğrulanacak Kartlar:**  
1. `TASK-MTQ63RR8Z0G8E` — Pano rozeti: kanıt kaydı fırsat başına anahtarlandı (`geli-tirici` raporu)  
2. `TASK-MTS80QQD1LVJQ` — Landing hero mock i18n, LIVE SYSTEM dürüstlük düzeltmesi, blog markdown render (`blog-yazar` raporu)  

---

## 1. Kart 1: TASK-MTQ63RR8Z0G8E — G0 Rozeti (Fırsat Başına Kanıt Kaydı)

### 1.1 DoD İddialarının Listesi ve Doğrulama Durumu

| DoD Maddesi | İddia Edilen Durum | Bağımsız Doğrulama Sonucu |
|---|---|---|
| **1. Şema Migration & Anahtar Yapısı** | `TopicMatch` tablosu `opportunityId` ile anahtarlandı (`@@unique([tenantId, topicId, opportunityId])`). | ✅ **DOĞRULANDI** — Fırsat başına kanıt satırları başarıyla veritabanına yazıldı. |
| **2. İki Fırsatın Yan Yana Gösterimi** | Aynı konuda iki farklı fırsat olduğunda panoda her biri KENDİ G0 puanını gösteriyor. | ✅ **DOĞRULANDI** — Panoda aynı konuda Koordinatör (⭐ 44.9) ve Ortak (⭐ 48.23) kendi puanlarını gösterdi. |
| **3. Detay Sayfası Uyumluğu** | Pano rozeti ile detay sayfasındaki puan %100 birebir eşleşiyor. | ✅ **DOĞRULANDI** — Koordinatör detayında 44.9/100, Ortak detayında 48.23/100 görüntülendi. |
| **4. Gerçek Tarayıcı Görsel Kanıtı** | İki farklı puan tek bir ekran görüntüsünde kanıtlandı. | ✅ **DOĞRULANDI** — [`05-board-two-opportunities-one-topic.png`](file:///Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTQ63RR8Z0G8E-screenshots/05-board-two-opportunities-one-topic.png) alındı. |

### 1.2 Gerçek Tarayıcı Kanıtı ve Ekran Görüntüleri

Playwright E2E test koşusu (`tests/e2e/g0-computed-score.spec.ts`) ile üretilen ekran görüntüleri:

- **[`docs/agent-results/TASK-MTQ63RR8Z0G8E-screenshots/05-board-two-opportunities-one-topic.png`](file:///Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTQ63RR8Z0G8E-screenshots/05-board-two-opportunities-one-topic.png)** — Pano üzerinde aynı konuda 2 kart:
  - Fırsat 1 (Koordinatör): **⭐ 44.9**
  - Fırsat 2 (Ortak): **⭐ 48.23**
  - Kanıtı olmayan 3. kartta rozet **yok** (0 uydurma sayısı basılmıyor).
- **[`docs/agent-results/TASK-MTQ63RR8Z0G8E-screenshots/06-detail-coordinator.png`](file:///Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTQ63RR8Z0G8E-screenshots/06-detail-coordinator.png)** — Koordinatör detay sayfası: **44.9/100**.
- **[`docs/agent-results/TASK-MTQ63RR8Z0G8E-screenshots/07-detail-partner.png`](file:///Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTQ63RR8Z0G8E-screenshots/07-detail-partner.png)** — Ortak detay sayfası: **48.23/100**.

### 1.3 Hüküm (Kart 1)

**GEÇTİ**

**Gerekçe:** Aynı konuya bağlı iki fırsat panoda ve kendi detay sayfalarında bağımsız ve doğru G0 puanlarını göstermekte, eski tek-konu ezilme hatası tamamen giderilmiş ve görsel kanıtla doğrulanmıştır.

---

## 2. Kart 2: TASK-MTS80QQD1LVJQ — Landing Hero i18n, LIVE SYSTEM & Blog Markdown

### 2.1 DoD İddialarının Listesi ve Doğrulama Durumu

| DoD Maddesi | İddia Edilen Durum | Bağımsız Doğrulama Sonucu |
|---|---|---|
| **1. Hero Mock i18n** | Hero mock bölümündeki 9 UI etiketi dile göre (TR/EN) değişiyor. | ✅ **DOĞRULANDI** — `/tr` 'G0: Triage & Fizibilite', 'Koordinatör'; `/en` 'G0: Triage & Feasibility', 'Coordinator' gösteriyor. |
| **2. LIVE SYSTEM Düzeltmesi** | Yeşil `LIVE SYSTEM` rozeti kaldırıldı, yerine nötr `Örnek Görünüm` / `Sample View` rozeti kondu. | ✅ **DOĞRULANDI** — Canlı olmayan veriye "LIVE" yazısı kaldırıldı. |
| **3. Blog Markdown Render** | Blog gövdesinde literal `**` ve `## ` karakterleri temizlendi, HTML/React blokları (`<strong>`, `<ul>`, `<ol>`) doğru render edildi. | ✅ **DOĞRULANDI** — Ham markdown karakterleri gitmiş, kalın ve listeler düzgün render edilmiştir. |
| **4. Gerçek Tarayıcı Görsel Kanıtı** | TR ve EN için ayrı ayrı ekran görüntüleri üretildi. | ✅ **DOĞRULANDI** — 6 adet ekran görüntüsü üretildi. |

### 2.2 Gerçek Tarayıcı Kanıtı ve Ekran Görüntüleri

Playwright görsel doğrulama koşusu ile üretilen ekran görüntüleri:

- **[`docs/agent-results/TASK-MTS80QQD1LVJQ-screenshots/01-hero-mock-badge-tr.png`](file:///Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTS80QQD1LVJQ-screenshots/01-hero-mock-badge-tr.png)** — TR Landing hero mock penceresinde **`ÖRNEK GÖRÜNÜM`** rozeti.
- **[`docs/agent-results/TASK-MTS80QQD1LVJQ-screenshots/02-hero-mock-badge-en.png`](file:///Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTS80QQD1LVJQ-screenshots/02-hero-mock-badge-en.png)** — EN Landing hero mock penceresinde **`SAMPLE VIEW`** rozeti.
- **[`docs/agent-results/TASK-MTS80QQD1LVJQ-screenshots/03-hero-mock-cards-tr.png`](file:///Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTS80QQD1LVJQ-screenshots/03-hero-mock-cards-tr.png)** — TR kanban mock kartlarında Türkçe etiketler (`G0: Triage & Fizibilite`, `7 Ortak • 5 Ülke Onaylı`).
- **[`docs/agent-results/TASK-MTS80QQD1LVJQ-screenshots/04-hero-mock-cards-en.png`](file:///Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTS80QQD1LVJQ-screenshots/04-hero-mock-cards-en.png)** — EN kanban mock kartlarında İngilizce etiketler (`G0: Triage & Feasibility`, `7 Partners • 5 Countries Approved`).
- **[`docs/agent-results/TASK-MTS80QQD1LVJQ-screenshots/05-blog-bullet-list-tr.png`](file:///Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTS80QQD1LVJQ-screenshots/05-blog-bullet-list-tr.png)** — Blog sayfasında `<ul>` madde imleri ve `<strong>` kalın metinler (literal `**` veya `*` yok).
- **[`docs/agent-results/TASK-MTS80QQD1LVJQ-screenshots/06-blog-numbered-list-tr.png`](file:///Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTS80QQD1LVJQ-screenshots/06-blog-numbered-list-tr.png)** — Blog sayfasında `<ol>` numaralı liste ve düzgün başlık hiyerarşisi.

### 2.3 Hüküm (Kart 2)

**GEÇTİ**

**Gerekçe:** `LIVE SYSTEM` yanıltıcı rozeti dürüst "Örnek Görünüm / Sample View" ile değiştirilmiş, hero mock i18n desteği TR ve EN için tam olarak sağlanmış, blog detay sayfasındaki ham markdown karakterleri temizlenerek düzgün React elemanlarına dönüştürülmüştür.

---

## 3. Genel Özet ve Nihai Karar

| Kart | İnceleme Konusu | Hüküm |
|---|---|---|
| **TASK-MTQ63RR8Z0G8E** | G0 rozeti kanıt kaydı fırsat başına anahtarlama | **GEÇTİ** |
| **TASK-MTS80QQD1LVJQ** | Hero mock i18n, LIVE SYSTEM rozeti kaldırma & Blog markdown render | **GEÇTİ** |
