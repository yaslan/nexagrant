# ADR-0004 — Belediye / kamu segmenti öncelik 3'ten 1'e çıkar

- **Durum:** **KABUL**, patron kararı
- **Tarih:** 2026-09-29
- **Bağlam kartı:** TASK-MULR4EOGWKAGX · uygulama kartları: TASK-MULR39X1K5K6C (radar), TASK-MULR3TQ24ZZ7N (hazırlık karnesi), TASK-MULR4ATI5T158 (İlkadım pilotu + OKA kanalı) · sprint FB-KAMU-1
- **Hazırlayan:** LEED-FB · **Karar veren:** patron

## Problem

`docs/BUSINESS_MODEL.md` §3, belediyeleri 3. öncelikte tutuyor ve Yıl 1 hedefini KOBİ segmentine bağlıyor. Patronun hedefi ise kısa sürede kullanıcı kazanmak. Bu hedef için en uygun kitle, AB fonları konusunda deneyimsiz olan ama sayıca çok ve birbirine ağla bağlı kurumlar (belediyeler, kalkınma ajansları, belediye birlikleri).

## Seçenekler

| Seçenek                                                            | Artı                                                               | Eksi                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| A. Önceliği değiştirme, KOBİ ile devam                             | Plan değişmez                                                      | Tek tek satış yavaş, kullanıcı kazanımı hedefiyle uyuşmuyor  |
| B. Yalnız kalkınma ajansı kanalı (belediye dolaylı)                | Satın alma sürecini ajans yürütür                                  | Belediye tarafında doğrudan bir pilot ve geri bildirim olmaz |
| **C. Belediye/kamu öncelik 1 + ajans kanalı + tek pilot belediye** | Hem doğrudan pilotla ürün geri bildirimi hem de toplu dağıtım olur | Kamu ödemesi yavaş; yeni veri kaynakları gerekir             |

## Karar

**Seçenek C.** Belediye ve kamu kurumları öncelik 1'e çıkar. Büyüme kanalı olarak kalkınma ajansları kullanılır. İlk pilot kurum **İlkadım Belediyesi (Samsun)**, kanal pilotu adayı **Orta Karadeniz Kalkınma Ajansı (OKA)**.

İlk teslimatlar (FB-KAMU-1):

1. Fon Hazırlık Karnesi: kayıtsız, ücretsiz, kullanıcı kazanımının ana aracı.
2. Belediye çağrı radarı: Erasmus+, Missions/NEB, Interreg/IPA ve kalkınma ajansı programları. **Düzeltme (29.09.2026, TASK-MULR4ATI5T158):** CERV ve LIFE resmî katılımcı ülke listelerinde Türkiye yok; Türk başvuru sahiplerine kapalı. Radar kataloğunda (`819aff09`) bu şekilde işaretli.
3. İlkadım pilot planı + OKA kanal önerisi.

## Sonuçlar

- KOBİ ve danışmanlık segmentleri bırakılmaz; ürün çekirdeği ortak kalır, kamu için yeni katmanlar eklenir.
- Kamuya satış yıllık TL paketi ve e-Fatura gerektirir. e-Fatura/GİB işi (TASK-MTRJSOWFH6B45) hâlâ insan aksiyonu bekliyor ve ücretli kamu satışını bloke ediyor. Pilot bu yüzden ücretsiz yürür.
- Pilotun başarı ölçütleri ve ürün boşlukları (toplu davet, ajans panosu) TASK-MULR4ATI5T158 çıktısından yeni kartlara dönüşür.

## Riskler

- Kamuda satın alma ve karar süreleri uzun olduğu için gelir gecikir.
- Interreg/IPA ve ajans çağrıları için kararlı bir veri kaynağı yok (radar kartının Faz 3 spike'ı).
- Kamu verisi nedeniyle KVKK ve veri yerleşimi soruları çıkar.
