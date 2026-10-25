# API.md — İç ve dış API

Tüm rotalar `/api/v1/*`; JSON; zod doğrulama; hata biçimi `{ error: { code, message, details? } }`. İç istemci oturum çerezi; dış istemci `Authorization: Bearer <ApiKey>` (v1.3). Tüm yanıtlar kiracı kapsamlı (RLS).

## İç (uygulama) uç noktaları — MVP

| Yöntem | Yol | Amaç | Modül/katman |
|---|---|---|---|
| GET | `/calls?programme&status&deadlineFrom&eligible&minFit&q&page` | Konu listesi + uyum | K1 |
| GET | `/calls/:topicId` | Konu detayı (+ TopicStat, TopicMatch) | K1 |
| POST | `/calls/:topicId/opportunities` | Pipeline'a al | K5 |
| GET/POST/PATCH/DELETE | `/saved-searches` | Kayıtlı aramalar | K1 |
| GET | `/opportunities?stage&workspace&owner` | Kanban | M5 |
| POST | `/opportunities/:id/gates/:gate` `{inputs, override?, reason?}` | Kapı kararı | M5 |
| POST | `/opportunities/:id/efforts` | Çaba kaydı | M5 |
| GET | `/partners?q&country&type&sme&prefix&sort` | Ortak arama | M1 |
| GET | `/partners/leaders?prefix&limit=20` | Konu liderleri | M1 |
| GET | `/partners/:pic` · `/partners/:pic/graph?depth=1&limit=30` | Kart ve graf | M1 |
| GET | `/partner-search/announcements?topic&country&type&orgType&q&page` | Partner Search ilanları (geri çekilenler hariç; Discover/Basic ayda 10 sorgu, sonra 429) | M1 (FO-61) |
| GET | `/organizations/:pic/announcements?…aynı filtreler` | Bir kurumun ilanları (aynı sayaç) | M1 (FO-61) |
| GET | `/topics/:identifier/partner-signal` | `{ total, requests, offers, byCountry, byOrgType, trCount }` — sayaçtan düşmez | M1 (FO-61) |
| GET | `/partner-search/announcements/export?format=csv\|json&…filtreler` | Ultra dışa aktarma; kaynak + CC BY 4.0 notu dosyada; en çok 10.000 satır, kesilirse JSON `truncated: true` ve CSV'de `# Truncated` satırı; yalnız oturum | M1 (FO-61) |
| GET/POST/PATCH | `/relationships`, `/relationships/:id/interactions` | Odak kişi | M4 |
| GET/POST/PATCH/DELETE | `/evidence` | Kanıt | M3 |
| GET/POST | `/concepts`, `/concepts/:id/generate` (SSE akış), `/concepts/:id/export?format=docx` | Concept note | M2 |
| POST | `/matching/:opportunityId/compute` · GET `/matching/:opportunityId` · POST `/seats/:seatId/invite` | Eşleştirme | M8 |
| GET | `/settings/modules` · POST `/settings/modules/:id/enable {target}` · POST `/settings/modules/:id/disable` | Yönetici konsolu | çekirdek |
| GET/PUT | `/settings/gates` | Kapı kuralları ve ağırlıklar | M5 |
| GET | `/billing/entitlements` · POST `/billing/checkout {planId|sku, interval}` · POST `/billing/portal` | Faturalama | çekirdek |
| POST | `/webhooks/stripe` | Stripe | çekirdek |
| GET | `/ai/usage?proposalId` · GET `/ai/disclosure/:proposalId?format=pdf` | YZ günlüğü ve beyan | K6 |
| GET | `/dashboard/kpis?from&to` | KPI | çekirdek |
| POST | `/admin/imports/topic-stats` (xlsx) · POST `/admin/imports/work-programme` (pdf) | K3, RAG | platform admin |
| POST | `/admin/jobs/k1` · `/admin/jobs/k2 {month}` | İş tetikleme | platform admin |

Akış (SSE) yalnızca `generate` uç noktalarında; diğerleri senkron.

## Dış API — v1.3 (`ApiKey`, kapsamlar: `partners:read`, `calls:read`)

| Yöntem | Yol | Not |
|---|---|---|
| GET | `/public/v1/partners/leaders?prefix=` | 20 kayıt; 10.000 çağrı/ay |
| GET | `/public/v1/partners/:pic` | Kart (kiracı notları hariç) |
| GET | `/public/v1/partners/:pic/collaborators` | Collab |
| GET | `/public/v1/calls?eligibleCountry=TR&status=open` | Normalize konu listesi |

Partner Search (FO-61) aynı yollarla `/api/v1/` altında da var (`partner-search/announcements`, `organizations/:pic/announcements`, `topics/:identifier/partner-signal`); anahtar M1 kapısından (`authenticateApiKey`) geçer, gövde oturum yoluyla aynıdır. Sözleşme tipleri: `src/core/contracts/partner-search.ts`. Hatalar: `400 invalid_query`, `403 { error: 'MODULE_ACCESS_DENIED', module: 'M1', reason, requiredPlans? }`, `429 PARTNER_SEARCH_QUOTA_EXCEEDED`. Özetler sunucuda `maskContact`'tan bir kez daha geçer.

Rate limit: `429` + `Retry-After`; kullanım `ApiUsage` tablosuna; lisans metni türev veri/AB açık veri ayrımını belirtir.

## Olaylar (`src/core/events`)

`opportunity.created|stage.changed`, `gate.decided`, `seat.status.changed`, `concept.approved`, `esr.uploaded`, `module.state.changed`, `subscription.updated`, `ai.used`, `relationship.stale` (60 gün), `topic.deadline.approaching` (T-30/T-14/T-7/T-1).
