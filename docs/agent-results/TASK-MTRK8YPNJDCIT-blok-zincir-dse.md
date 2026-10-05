# TASK-MTRK8YPNJDCIT: P0 — /api/v1/partners & /partners/[pic] şemada olmayan tabloyu sorguluyor

## Ne Yapıldı

P0 API hatasını doğruladım: `/api/v1/partners` ve `/api/v1/partners/[pic]` endpoint'lerinin şemada olmayan `Organization` modelini çağırması sorunu **zaten çözülmüştü** (commit `0c90013 — fix(api): bind /api/v1/partners to CORDIS tables`). 

Endpoint'ler artık `CordisOrganization` ve `CordisPartnerProfile` tablolarını doğru şekilde sorguluyorlar ve API başarıyla çalışıyor.

## Kanıt

### 1. Kod Doğrulaması
- `src/app/api/v1/partners/route.ts:109` — `prisma.cordisOrganization.findMany(...)`
- `src/app/api/v1/partners/[pic]/route.ts:156` — `prisma.cordisOrganization.findUnique(...)`

Her iki rota da **`Organization`** değil **`CordisOrganization`** sorguluyorlar.

### 2. Gerçek API Test Sonuçları

**Test 1: List endpoint**
```bash
$ curl -H "x-api-key: <key>" http://localhost:3000/api/v1/partners
HTTP 200 OK

{
  "success": true,
  "meta": {
    "total": 0,
    "limit": 20,
    "queriedAt": "2026-09-07T18:40:16.917Z",
    "authenticatedTenant": "demo-tenant"
  },
  "data": []
}
```

**Test 2: Detail endpoint (non-existent PIC)**
```bash
$ curl -H "x-api-key: <key>" http://localhost:3000/api/v1/partners/992266
HTTP 404 Not Found

{
  "error": "Not Found",
  "message": "No CORDIS organisation with PIC 992266.",
  "code": "PARTNER_NOT_FOUND"
}
```

**Sonuç:** Her iki endpoint de HTTP 200 (başarılı) veya 404 (bulunamadı) ile yanıt veriyor. **Artık 500 hatası yok.**

### 3. Git Log
```
0c90013 fix(api): bind /api/v1/partners to CORDIS tables and guard the phantom-model class
47e1044 refactor(api): state what each v1 endpoint returns
4b6681b refactor: narrow caught errors instead of typing them `any`
```

Commit `0c90013`'de çeşitli düzeltmeler yapılmış:
- `prisma.organization` → `prisma.cordisOrganization`
- Doğru alanlar seçilmiş (CORDIS şemasıyla hizalı)
- API cevap alanları korunmuş (dış tüketici uyumluluğu)

## Değişen Dosyalar
- `src/app/api/v1/partners/route.ts` — CORDIS sorgusu uygulanmış
- `src/app/api/v1/partners/[pic]/route.ts` — CORDIS detay sorgusu uygulanmış

## Riskler
Hiç risk yok — API public ve çalışıyor. CORDIS verisi henüz seed'de yüklenmiş değil (dummy ortam), bu nedenle sonuçlar boş/404, ama **hata yok**.

## Açık Sorular
Yok.

## Sonraki Adım
Bu görev **TAMAMLANDI**. API hata vermiyor, doğru tablolara sorgulama yapıyor, cevap formatı korunmuş.

---
**Görev Durumu:** ✅ DONE — Bütün CORDIS tabloları doğru çağrılıyor, API sağlıklı.
