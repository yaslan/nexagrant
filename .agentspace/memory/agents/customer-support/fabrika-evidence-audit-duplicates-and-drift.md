---
name: fabrika-evidence-audit-duplicates-and-drift
description: Fabrika kanıt-disiplini (CLAUDE.md kural 7) taraması bir dosyada bitmez — aynı sahte iddia başka dosyada kopyalanmış olabilir, ve hardcoded "config facts" da zamanla koddan sapabilir
metadata:
  type: project
  updatedAt: 2026-09-09
---

[[fabrika-admin-shell-compliance-badges-were-fiction]]'ın devamı (`TASK-MTUGU8O95B925`).
İki yeni ders:

**1. Aynı sahte iddia birden fazla dosyada yaşayabilir.** `admin/layout.tsx`'teki
`RLS Güvenlik: 30/30 Tablo` rozetini kaldırmıştım (önceki kart), ama `admin/settings/page.tsx`
içinde **birebir aynı yanlış iddianın bir kopyası** vardı (`RLS Policy Kapsam: 30/30 Tablo
(%100)`) — grep taramamı tek dosyaya sınırladığım için ilk turda kaçmıştı. Bir "kanıtsız iddia"
bulgusu düzeltildiğinde, aynı metnin/örüntünün kardeş dosyalarda (aynı bölüm — burada
`admin/*`) tekrar edip etmediğini de grep'lemek gerekiyor, sadece bulunduğu dosyayı değil.

**2. "Kanıtsız" ile "yanlış" farklı şeyler — ikisi de olabilir.** `Aylık Varsayılan Kredi: 500
Kredi (Team Plan)` hem kanıtsızdı (Evidence'a bağlı değil) hem de **basitçe yanlıştı**: sistemde
"Team Plan" diye bir paket yok (gerçek adlar: Discover/Basic/Pro/Ultra), ve yeni kiracıya
atanan gerçek varsayılan `free` planı 10 kredi veriyor, 500 değil (500, alakasız şekilde `Pro`
planına ait). Aynı şekilde `Varsayılan LLM Model: Claude 3.5 Sonnet` de yanlıştı — gerçek
varsayılan `src/lib/llm.ts`'teki `DEFAULT_MODELS.anthropic = 'claude-sonnet-5'`. Bu tür
"config açıklama" metinleri, kodun kendisi değiştikçe (model/plan güncellemesi) sessizce
bayatlıyor. Fix: sabit string yazmak yerine ilgili sabiti (`DEFAULT_MODELS`, `PLAN_GRANTS`)
`export` edip UI'a import et — o zaman drift derlemede/testte görünür olur, ayrı bir metin
kopyası olarak sessizce yanlış kalmaz.

**Nasıl uygula:**
- Bir "sahte durum rozeti" bulgusunu düzeltirken, aynı metni/örüntüyü `grep -rn` ile aynı
  bölümün (admin/*, app/*, vb.) TÜM dosyalarında ara — tek dosyayla sınırlama.
- Sabit bir "config açıklaması" metniyle karşılaşınca (versiyon, model adı, plan adı, kredi
  miktarı), önce kod tabanında gerçek kaynağı bul (`grep` ile ilgili sabiti/array'i) ve
  değerin hâlâ doğru olup olmadığını doğrula — genelde bir örnek kodda hardcode edildiği anda
  doğruydu, sonra kod değişti, metin değişmedi.
- Bulguyu düzeltirken iki seçenek var: kaldır (canlı kaynak yoksa/pahalıysa) ya da gerçek
  sabiti `export` edip import et (canlı kaynak koddaysa ve ucuzsa) — ikinci yol daha iyi çünkü
  gelecekteki drift'i otomatik önler.

İlgili: [[fabrika-admin-shell-compliance-badges-were-fiction]]
