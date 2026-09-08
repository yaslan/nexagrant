---
name: fabrika-legal-claims-retention-basis-kvkk-5-2-e-gdpr-17-3-e
description: Bir kaydın kullanıcı silinse/imha edilse dahi silinmemesi gerektiğini savunurken kullanılacak bent eşleşmesi — KVKK md.5/2-e ile GDPR art.17(3)(e) birbirinin tam karşılığı
metadata:
  type: project
  updatedAt: 2026-09-08
---

**Eşleşme:** KVKK md.5/2-e ("bir hakkın tesisi, kullanılması veya korunması için veri
işlemenin zorunlu olması") ile GDPR art.17(3)(e) ("necessary for the establishment,
exercise or defence of legal claims") metinsel olarak birbirinin doğrudan karşılığı.
TASK-MTT1VEUF8Z9SH'te `DualApprovalStep` için bu çift kullanıldı: `actorUserId`
kasıtlı olarak FK değil ve kullanıcı silinse de imza satırı kalıyor — bunun hukuki
gerekçesi bu bent çiftidir, "meşru menfaat" (md.5/2-f) değildir çünkü orada konu
işlemenin kendisi değil, **imha/silme akışının bir satırı ATLAMASI**.

**Nasıl uygulanır:** Bir tablo/alan hem (a) işleme sırasında bir hukuki sebebe (çoğu
zaman md.5/2-f) dayanıyor HEM DE (b) kullanıcı silme talebinde otomatik silinmiyorsa,
envanterde bunu **iki ayrı hukuki sebep satırı** olarak yaz: "Hukuki sebep (işleme)"
ve "Hukuki sebep (saklama istisnası)". Tek satırda karıştırmak, "neden bu satır
imha akışının dışında" sorusunu cevapsız bırakır — tam da denetimde sorulan soru.

**Nerede tekrar lazım olabilir:** `docs/legal/processing-register.md` içinde hâlâ
"açık" işaretli benzer durumlar var — §3 (Stripe/Subscription kimliksizleştirme
adımı yok), §13 (`AuditEvent.actorId` kimliksizleştirilmiyor, dpa-en.md §6'daki
"denetim kayıtları kimliksizleştirilmiş" iddiasıyla çelişiyor). Bu ikisi de aynı
bent çiftiyle kapatılabilir/gerekçelendirilebilir ama şu an yapılmadı — bu görevin
kapsamı değildi, ADIYLA açık bırakıldı.

**Saklama süresi "belirsiz" bırakılamıyorsa ama hukuk girdisi (A1) henüz yoksa:**
somut bir DB alanına (ör. `signedAt`, işlemin kapandığı tarih) ve genel hukuki
zamanaşımı süresine (TBK md.146 — 10 yıl, Türk hukuku için varsayılan) bağla, ve
metni açıkça "VARSAYIM — A1 ile kesinleşecek" diye işaretle. Bu, "belirsiz bırakma"
kuralını ihlal etmeden hukuk girdisini beklemeden yayınlamayı sağlıyor.

Bkz. [[fabrika-erasure-decision-split-the-two-not-null-columns]] (Seçenek C kararının
kendisi), [[fabrika-deferred-to-another-card-is-not-fixed]] (aynı ilkenin tersi:
"başka kartın kapsamı" demek düzeldi demek değildir — burada bilinçli olarak
kapsam dışı bırakılan §3/§13 için de aynı disiplin geçerli, birinin bunu alması
gerekiyor).
