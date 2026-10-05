# TASK-MTRJSOWFH6B45 — e-Fatura go-live: hafta sonu öncesi kapatılabilen her şey

**Ajan:** blok-zincir-lead (LEED-EN) · **Tarih:** 2026-09-08 · **Sprint:** SPRINT-S12 · **Dal:** dev

## (1) Ne yapıldı

Kart "DIŞ GİRDİ BEKLİYOR" durumunda ve bugün **kapatılamaz** — bekleyen şey iş gücü
değil, entegratör sözleşmesi (patron 12-13 Eylül'de getiriyor). Bu yüzden kartın
**bugün yapılabilir kısmı** yapıldı: iddia ölçüldü, iki gerçek boşluk bulundu,
ikisi de kapatıldı.

1. **"Kod tarafı hazır" iddiası ölçüldü — DOĞRULANDI.** `pnpm efatura:preflight`
   koşuldu: 13 değişken, 3 blok, dürüst çıktı, çıkış kodu 1. Yalan yeşil yok.
2. **BULGU 1 — dokümanda bayat paragraf.** `docs/EFATURA_SETUP.md`, ADR-0002 için
   "kararı bekleyen konu" ve "bu alanlar şemada henüz yok" diyordu. ADR-0002 bugün
   **Seçenek (b) olarak karara bağlandı** ve Faz 2 (`TASK-MTT13PK0Z4ZLB`) koşuyor.
   Paragraf güncellendi — hafta sonu bu belgeyi okuyacak kişi ölmüş bir öncüle
   göre karar vermesin diye.
3. **BULGU 2 — 13 kutuyu doldurmak gönderim için YETMEZ.** `ADAPTERS`
   (`src/lib/efatura-integrator.ts:161-169`) bugün yalnız `sandbox` içeriyor.
   Kimlik bilgileri eksiksiz girilse bile sonuç `provider_unsupported` döner.
   Bu, hafta sonu görüşmesinden **önce** bilinmesi gereken bir şeydi: adaptör
   satıcıya özeldir ve ancak satıcının API sözleşmesi elde olunca yazılabilir.
   `docs/EFATURA_SETUP.md`'ye "Adım 0" olarak **entegratörden istenecek 8 teknik
   cevap** eklendi (protokol, kimlik doğrulama, zarf numarası alanı, test ortamı,
   UBL-TR sürümü, mali mühür sahipliği, hata/idempotency kuralı, döviz blokları).
   Bu liste olmadan Pazartesi ikinci tur gerekirdi.
4. **Patron için taşınabilir tek sayfa yayımlandı** (Artifact, `db` ile kalıcı
   işaretleme): 3 karar + 8 soru + 13 kutu + çıkış günü 5 adımı.
   https://claude.ai/code/artifact/7ca0e043-1307-4434-a5d8-fcf46fea3a55

## (2) Kanıt — kopyalanmış gerçek çıktı

### 2.1 Preflight (`pnpm efatura:preflight`) — dürüst kırmızı
```
--- BLOK DEĞERLENDİRMESİ ---
1. Satıcı Kimliği Bloğu : ❌ EKSİK (INVOICE_SUPPLIER_NAME, INVOICE_SUPPLIER_VKN,
   INVOICE_SUPPLIER_TAX_OFFICE, INVOICE_SUPPLIER_ADDRESS, INVOICE_SUPPLIER_CITY)
2. Vergi (KDV) Bloğu    : ❌ EKSİK (INVOICE_VAT_RATE)
3. Entegratör Bloğu     : ❌ EKSİK (EFATURA_INTEGRATOR_PROVIDER, EFATURA_INTEGRATOR_BASE_URL,
   EFATURA_INTEGRATOR_USERNAME, EFATURA_INTEGRATOR_PASSWORD)

--- SONUÇ HÜKMÜ ---
📌 Fatura kaydı hiç oluşturulmaz: INVOICE_VAT_RATE 0-100 arası bir yüzde değil.
   SystemAlert (vat_rate_not_configured) yazılır, ödeme etkilenmez. ...
   GİB'e gönderilmez, sebep: ... eksik.

[ELIFECYCLE] Command failed with exit code 1.
```

### 2.2 Adaptör kaydı gerçekten boş (BULGU 2'nin kanıtı)
```
$ grep -n "ADAPTERS" -A4 src/lib/efatura-integrator.ts
161: * Vendor adapters, by the value of `EFATURA_INTEGRATOR_PROVIDER`.
164:  sandbox: createSandboxAdapter,
167:/** The adapter for the configured vendor, or null when there is none. */
169:  const factory = ADAPTERS[config.provider.toLowerCase()];
199:    return { status: 'provider_unsupported', provider: state.config.provider };
```
Yalnız `sandbox` kayıtlı → gerçek satıcı için gönderim yolu YOK.

### 2.3 env şeması — 13 değişken, hepsi opsiyonel (eksik değişken uygulamayı düşürmüyor)
```
$ grep -cE "INVOICE_SUPPLIER_|INVOICE_VAT_RATE|EFATURA_INTEGRATOR_" src/lib/env.ts
13
```

## (3) Değişen dosyalar
- `docs/EFATURA_SETUP.md` — bayat ADR-0002 paragrafı düzeltildi; "Adım 0: entegratörden
  istenecek 8 cevap" bölümü eklendi
- `docs/adr/ADR-0002-foreign-currency-invoice-fx.md` — Durum: Öneri → **KABUL (Seçenek b)**;
  KARAR bölümü, bağlayıcı 5 sonuç, kalan tek soru (TCMB kesintisi) ve Faz 2 ağaç ölçümü yazıldı
- `docs/agent-results/TASK-MTRJSOWFH6B45-blok-zincir-lead-3.md` — bu rapor
- Kod değişikliği YOK (bu bir lider/karar turudur)

## (4) Riskler
- **Adaptör yazımı takvimi:** satıcı 12-13 Eylül'de belli olsa bile adaptör + test
  ortamında gerçek zarf numarası alma işi Pazartesi başlar. 8 sorunun cevabı eksik
  dönerse ikinci tur gecikme yaratır.
- **USD fatura yolu Faz 2'ye bağlı:** katalog USD; `foreignCurrencyFilingBlock`
  TL karşılığı olmayan belgeyi adaptöre hiç ulaştırmıyor. `TASK-MTT13PK0Z4ZLB`
  12 Eylül'den önce inmezse, entegratör hazır olsa bile USD abonelikler
  faturalandırılamaz.
- **KDV oranı mali müşavir kararına bağlı** — boşken hiç fatura satırı yazılmıyor.

## (5) Açık sorular
1. TCMB erişilemediğinde fatura kesme dursun mu (öneri: evet + `SystemAlert`)?
   Faz 2'nin B fazı bu cevapla açılıyor.
2. Entegratör görüşmesine kim giriyor — 8 teknik soruyu soracak kişi teknik mi,
   ticari mi? Teknik değilse soruları yazılı gönderelim.

## (6) Sonraki adım
- 12-13 Eylül: patron 13 değeri + 8 cevabı getirir (çıkış sayfası üzerinden işaretler).
- 14 Eylül Pazartesi: satıcıya özel adaptör kartı açılır ve geliştiriciye delege edilir.
- O tarihe kadar bu kart `in_progress` kalır; kimseye atanmaz.
