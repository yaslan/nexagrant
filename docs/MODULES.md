# MODULES.md — Modül spesifikasyonları

Kayıtlı modüllerin listesi ve sayısı tek yerde tutulur: `src/lib/modules/registry.ts` (`moduleRegistry`, `getModuleCounts()`). Bu belge her modülü ayrı başlıkta anlatır; kayıtlı her modülün burada bölümü olmayabilir.

Her modül için: amaç · kullanıcı hikâyeleri · ekranlar · veri · iş kuralları · YZ kullanımı · kabul kriterleri · plan. Durum makinesi ve manifest biçimi `ARCHITECTURE.md §3`.

Ortak kurallar: tüm ekranlar `/[workspace]/<module-route>`; her liste sayfası filtre + kayıtlı görünüm; her yazma işlemi `AuditEvent`; YZ çıktısı her zaman "taslak" etiketiyle ve düzenlenebilir.

---

## M1 · Partner Intelligence Database (`partner-intel`) — MVP · Ekip

**Amaç:** Her kurum için tek ortak kartı; konu bazlı liderler; iş birliği grafı.
**Hikâyeler:** (a) Pipeline yöneticisi bir konu önekine göre ilk 20 koordinatörü görür ve karta gider. (b) Bir kurumun kiminle çalıştığını grafikte görür. (c) Kurumu "hedef" olarak işaretler (M4'e ilişki açar).
**Ekranlar:** `/partners` (arama: ad, ülke, tür, KOBİ, konu öneki; sıralama: koordinasyon, katılım, katkı, merkezilik), `/partners/[pic]` (özet, konu istatistikleri, projeler, iş birlikleri grafı — d3 force, ilk 30 komşu; kiracı notları), `/partners/leaders?prefix=` (liderler tablosu).
**Veri:** `Organization, OrgTopicStat, Collab, Participation, Project` (paylaşımlı) + `Relationship, PartnerOrg` (kiracı).
**Kurallar:** paylaşımlı veri salt okunur; kiracı notları ayrı; "CORDIS'te yok" kurumlar `PartnerOrg` olarak eklenir ve daha sonra PIC ile birleştirilebilir.
**YZ:** Kurum profili özeti (CORDIS `objective` metinlerinden, 1 kredi, önbellekli).
**Kabul:** liderler sorgusu < 2 s; graf 30 komşu < 1 s; not ekleme RLS testli.
**Bağlı özellik:** Partner REST API anahtarları (`/settings/api-keys`, TR `/ayarlar/api-anahtarlari`). Sayfa `moduleGate('M1')`, `generateApiKey` `assertModuleAccess('M1')` ile kapılı; `revokeApiKey` bilerek kapısız (M1 kapansa da sızan anahtar iptal edilebilmeli). `/api/v1/*` uçları (Partner REST API) M1 modül durumuna ve plan kapsamına kapılı: `authenticateApiKey` anahtarı doğruladıktan ve sayaçtan geçirdikten sonra `checkModuleAccessForTenant(tenantId, 'M1', …)` ile bakar (`src/lib/modules/tenant-access.ts`, kararı oturumlu kapıyla aynı `decideModuleAccess` verir). M1 kapalı ya da planda değilse **403** `{ error: 'MODULE_ACCESS_DENIED', module: 'M1' }`; anahtar yine de doğrulanır. Anahtar bir makine kitlesidir (`isMachine`): PILOT'ta olan bir tenant'ın entegrasyonu pilot yöneticileriyle aynı kapıdan çalışmaya devam eder (200); DEV yalnız FonBridge personeline açık olduğu için anahtara kapalıdır (403). Pilot kararı TASK-MVDPYNG1JI0S1 Bulgu 2 (patron kararı, API anahtarları PILOT'ta çalışmaya devam eder). Anahtar iptali bu kapıdan bağımsızdır: M1 kapalıyken anahtar iptali açık (FO-81). Kilit ekranının altında aktif anahtarlar listelenir, tek tek ya da toplu iptal edilir (`revokeApiKey`, her iptal bir `AuditEvent` yazar); üretme ve gizli değer kapalı kalır. Kapı `/api/v1` yolunda tek noktada, route başına değil (TASK-MVDPYNG1JI0S1).

## M2 · Concept Note Architectures (`concept-note`) — MVP · Başlangıç (3/ay), Ekip

**Amaç:** Program türüne göre kısa teklif şablonları ve YZ ile ilk taslak.
**Şablonlar (seed):** `cetp_pre` (CETP Stage 1), `dut_pre` (DUT ön teklif), `eurostars_summary`, `he_stage1_blind` (kör 10 sayfa; kurum adı yok kontrolü), `eic_step1`, `hopon_note`, `generic_partner_pitch` (konsorsiyuma davet paketi).
**Ekranlar:** `/concepts` (liste), `/concepts/new` (fırsat + şablon seç), `/concepts/[id]` (bölüm bölüm editör; sağda konu metni "expected outcomes/scope" ve M3 kanıt çekmecesi; kelime sayacı; sürüm geçmişi; "onayla" → G0→G1 belgesi).
**Kurallar:** `he_stage1_blind` şablonunda kurum/kişi adı tespit edilirse uyarı; bölüm başına `maxWords`; onaylı not sürümlenir.
**YZ:** `prompts/concept-note.md`: girdiler = konu metni (RAG), `TenantProfile`, seçili `Evidence`, önceki notlar; çıktı = bölüm bazlı markdown. Kredi: 1 / taslak; yeniden üretim 1.
**Kabul:** taslak < 90 s; kredi düşer; `AiUsageLog` yazılır; DOCX dışa aktarım.

## M3 · Evidence Pack (`evidence`) — MVP · Başlangıç

**Amaç:** Tekrar kullanılan kanıt kütüphanesi; kaynak ve geçerlilik disiplini.
**Ekranlar:** `/evidence` (tür, etiket, geçerlilik filtreleri; süresi dolanlar kırmızı), `/evidence/[id]`, teklif/concept editörlerinde "kanıt ekle" çekmecesi.
**Kurallar:** `kind=stat` için `sourceUrl` + `sourceDate` zorunlu; `validUntil` geçen kanıt eklenemez (uyarıyla geçersiz kılınabilir); "kanıt kapsama raporu": bir concept note/teklifteki sayısal iddialar (regex + YZ) ↔ bağlı kanıt.
**YZ:** Kaynak URL'den özet çıkarma (isteğe bağlı, 1 kredi).
**Kabul:** Keşif planında 50 kanıt sınırı; dışa aktarım CSV.

## M4 · Focal Point (`focal-point`) — MVP · Ekip

**Amaç:** Her ilişkinin tek iç sahibi ve tek dış muhatabı; temas ritmi.
**Ekranlar:** `/relationships` (sahip, tür, sıcaklık, son temas, sonraki adım; "60 gün temassız" görünümü), `/relationships/[id]` (zaman çizelgesi, etkileşimler, bağlı fırsatlar/koltuklar), haftalık özet e-postası.
**Kurallar:** Bir kurum için kiracı içinde tek `Relationship`; sahip değişince geçmiş korunur; `nextStepDue` geçince görev.
**Kabul:** 60 gün kuralı cron ile; M1 kartından "ilişki aç" tek tık.

## M5 · Proposal Production Workflows (`workflows`) — MVP · Başlangıç

**Amaç:** G0–G4 kapılarını yürüten iş akışı; geriye dönük plan; kişi-gün.
**Ekranlar:** `/pipeline` (kanban: G0..G4 + sonuç sütunları), `/pipeline/[id]` (kapı paneli: kural girdileri, geç/geçme, gerekçe; görevler; takvim T-6→T0; çaba kaydı), `/pipeline/calendar` (tüm son tarihler), yönetici: `/settings/gates` (kural eşikleri ve G0 ağırlıkları).
**Kurallar:** Kapı geçişi yalnızca `evaluateGate(gate, inputs, rules)` sonucuyla; manuel geçersiz kılma `pipeline_manager` + gerekçe; T-6 plan şablonu: T-24h gönderim, T-2h son kontrol, T-2w dış okuma, T-6w Part A, T-3m taslak, T-4m iş planı, T-5m ortak/bütçe kilidi, T-6m başlangıç.
**Kabul:** kapı kuralları birim testli (`src/lib/scoring/gates.test.ts`); kişi-gün raporu CSV; kanban sürükle-bırak kapı kuralını atlayamaz.
**Bağlı özellik:** Onay Merkezi / 4-Eyes (`/approvals`, TR `/onay-merkezi`). Sayfa `moduleGate('M5')`; `submitApprovalRequestAction`, `approveRequestAction`, `rejectRequestAction`, `cancelRequestAction` `assertModuleAccess('M5')` ile kapılı. M10 belge imzasının çift onayı (`src/lib/dual-approval.ts`) ayrı mekanizmadır, bu kapıya bağlı değildir.

## M6 · Evaluator Lens (`evaluator`) — v1.1 · İşletme / eklenti €99

**Amaç:** Resmî rubrikle iç ön değerlendirme; insan + YZ okuyucu; ESR ile kalibrasyon.
**Ekranlar:** `/evaluations` , `/evaluations/[id]` (kriter kartları 0–5; alt kriter güçlü/zayıf; REA sık hatalar listesi; sayfa/şablon kontrolü; IA'da Impact ×1,5 sıralama simülasyonu; insan okuyucu formu), teklif sayfasında "G3'e gönder".
**Kurallar:** en az 2 insan okuyucu **veya** 1 insan + YZ; G3 kararı ortalamayla; ESR yüklenince `calibration = predicted − actual` kaydı; "iç ön değerlendirme — resmî puan değildir" etiketi her yerde.
**YZ:** `prompts/evaluator-lens.md`; kriter başına ayrı çağrı; 3 kredi / değerlendirme.
**Kabul:** aynı taslak için tekrar puanlama sapması ≤ 0,5; kalibrasyon panosu.

## M7 · TTO Accelerator (`tto`) — v1.3 · Kurumsal / eklenti €129

**Amaç:** Üniversite TTO portföyleriyle şirket ihtiyaçlarını eşleştirmek; TRL planı; IP/lisans şablonları; araştırmadan konsorsiyuma takvim.
**Ekranlar:** `/tto` (portföy içe aktarma CSV/URL; ihtiyaç haritası; eşleşmeler), `/tto/[matchId]` (TRL yol haritası, IP kontrol listesi, ortak Ar-Ge taslağı).
**Veri:** `TtoPortfolioItem`, `NeedItem`, `TtoMatch`.
**Kurallar:** eşleşme M1 araştırma kurumu kartına bağlanır; her eşleşme M4 ilişkisi açar.
**YZ:** teknoloji özeti ↔ ihtiyaç eşleştirme (embedding), IP kontrol listesi taslağı.

## M8 · Consortium Matching (`consortium-matching`) — MVP · Ekip / eklenti €79

**Amaç:** Konu için rol matrisi ve koltuk başına aday listesi; çakışma uyarısı.
**Ekranlar:** `/matching/[opportunityId]` (rol matrisi düzenle; her koltuk için 5 aday; puan kırılımı; "davet et" → M4 ilişki + M10 davet paketi), `/matching/conflicts`.
**Puanlama (100):** konu deneyimi 35 (OrgTopicStat), coğrafi denge 15 (mevcut koltuklara göre ülke çeşitliliği), birlikte çalışma geçmişi 15 (Collab ile mevcut koltuklar), ilişki sıcaklığı 15 (M4; yoksa 0), merkezilik 10, rakip risk −(aynı çağrıda başka fırsatta aday) 10.
**Kurallar:** koordinatör koltuğu için `coordinatorCount ≥ 1` zorunlu filtre; aynı çağrıda iki fırsat aynı kurumu "CONFIRMED" yapamaz.
**Kabul:** 5 aday hesaplaması < 3 s; puan kırılımı görünür; birim test.

## M9 · Meeting Briefs (`briefs`) — v1.1 · İşletme

**Amaç:** Toplantı öncesi 1 sayfa brifing; sonrası not.
**Ekranlar:** `/briefs` , `/briefs/new` (ilişki/kurum + fırsat seç), `/briefs/[id]` (profil, geçmiş, açık konular, önerilen rol/teklif, 3 soru, kırmızı çizgiler; PDF), takvim entegrasyonu (Google/Microsoft, faz 2).
**YZ:** `prompts/meeting-brief.md`; 1 kredi.
**Kurallar:** brifing `Interaction` kaydına bağlanır; toplantı sonrası not aynı kayda.

## M10 · Follow-up Documents (`followups`) — v1.2 · İşletme

**Amaç:** Takip e-postası, NDA, LOI, ortak taahhüt formu, konsorsiyum anlaşması ana maddeleri, ESR sonrası özet, Eşik Üstü Ödülü paketi.
**Ekranlar:** `/documents` (tür, durum, imza), `/documents/new` (şablon + bağlam), `/documents/[id]` (editör, sürüm, imza durumu; DOCX/PDF).
**Kurallar:** her belge `Relationship` ve/veya `Proposal`'a bağlı; `award_pack` türü TÜBİTAK Eşik Üstü belgelerini (ESR, başvuru formu alanları) toplar; şablonlar tr/en.
**YZ:** `prompts/followup.md`; 1 kredi.

## M11 · Full Application Production (`application`) — v1.2 · İşletme / eklenti €149

**Amaç:** Part A/B uçtan uca üretim; bütçe/lump-sum; ortak katkı portalı; YZ beyanı; gönderim kontrol listesi.
**Ekranlar:** `/applications/[proposalId]` (bölüm ağacı — resmî şablon; blok kütüphanesi; kanıt çekmecesi; sayfa sayacı), `/applications/[id]/workplan` (WP/görev/teslimat/kilometre taşı; Gantt), `/applications/[id]/budget` (kişi-ay, birim maliyet, dolaylı %25, lump-sum WP tablosu), `/applications/[id]/partners` (ortak katkı portalı — `guest_partner` bağlantısı), `/applications/[id]/checklist` (Part A alanları, ekler, ≥24 s), `/applications/[id]/ai-disclosure`.
**Kurallar:** sayfa limiti (RIA/IA 45, CSA 30, lump-sum 50 — şablon sürümüne göre ayarlanabilir); bütçe toplamı = WP toplamı; `guest_partner` yalnızca kendi bölümlerini görür; YZ beyanı `AiUsageLog`'dan otomatik.
**YZ:** bölüm taslakları (`prompts/application-section.md`), tutarlılık kontrolü (hedef↔WP↔KPI), 2 kredi/bölüm.
**Kabul:** DOCX dışa aktarım resmî şablon stillerinde; bütçe tabloları XLSX; ortak portalı RLS testi.

---

## Yönetici konsolu (çekirdek, modül değil)

`/settings/modules`: modül listesi, durum rozeti, bağımlılık satırı, aç/kapa anahtarı (bağımlılık karşılanmıyorsa devre dışı + neden), plan dışıysa "Eklentiyi satın al", kademeli kapanış onay diyaloğu (liste), olay geçmişi. `/settings/gates`: kapı kuralları ve ağırlıklar. `/settings/billing`: plan, koltuk, kredi, eklentiler (Stripe Customer Portal bağlantısı). Platform yöneticisi `/admin/modules`: katalog ve sürümler, kiracı başına durum görünümü, "geliştirmede" modülleri seçili kiracılarda pilot yapma.
