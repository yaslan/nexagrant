# TASK-MTVSBEO7VX6Y4 — ek not: ikinci ön koşul (iyzico) kapandı

Bu dosya, orijinal TASK-MTVSBEO7VX6Y4 raporunun (`docs/agent-results/TASK-MTVSBEO7VX6Y4-be-fb.md`)
§4.1 ve §6'sında "rol geçişinin ikinci ön koşulu" olarak önerdiğim kartın kapandığını
kaydetmek için — talimatta istenen tam yol bu olduğu için buraya yazıyorum; asıl iş ve
kanıtın tamamı `TASK-MTVU5DI4C96DB` altında.

**Kapanan iş:** `docs/agent-results/TASK-MTVU5DI4C96DB-be-fb.md`

Özet: `src/lib/iyzico.ts`'teki `handleIyzicoWebhook`, orijinal raporun §4.1'inde ölçtüğüm
üzere `prisma.$transaction` kullanıyordu ve hiçbir yerde `set_config('app.tenant_id', …)`
çağırmıyordu — Stripe'ın önceki arızasından (para yazılıp anahtarın kaybolması) farklı
olarak, `fabrika_app` (NOBYPASSRLS) altında **ilk yazmanın kendisi** RLS tarafından
reddediliyor ve hiçbir iyzico ödemesi aboneliği etkinleştiremiyordu — ölçüldü, TASK-MTVU5DI4C96DB
raporu §2.1.

Düzeltme aynı desen: `prisma.$transaction` → `withTenant(tenantId, …)`. iyzico'nun kendi
`pg_advisory_xact_lock`'u eşzamanlı teslimat yarışını zaten kapatıyordu (StripeEventLog'a
eşdeğer ikinci bir tablo gerekmedi — ölçüldü, 8 eşzamanlı teslimat → 1 kredi satırı).
Kiracı/plan çözülemeyen dallara `SystemAlert` eklendi (önceden sessizce 200 dönüyordu).

Rol geçişi kartının şu an bildiğim ön koşul listesi: TASK-MTVSBEO7VX6Y4 (bu kart, kapalı) +
TASK-MTVU5DI4C96DB (kapalı) + `src/lib/api-auth.ts`'in şu anda kırık, başka bir ajanın
sürmekte olduğu işi (TASK-MTVU5DI4C96DB raporu §4 madde 4, §5 madde 2) — o üçüncü madde
henüz açık.
