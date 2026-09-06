# Beta Tasarım Ortağı Takip Çizelgesi (10 slot)

> E11.1 · Doldurulacak şablon. Gerçek ortak adları ve e-postaları **bu depoya yazılmaz** —
> kimlik bilgileri ürünün kendi kiracı kayıtlarında tutulur; burada yalnız takma ad (slot kodu),
> profil ve ilerleme durumu izlenir.

## Slot doluluk

| Slot | Profil | Ülke | Kiracı slug | Durum | Onboarding tarihi | Sorumlu (bizden) |
|---|---|---|---|---|---|---|
| BP-01 | KOBİ Ar-Ge | — | — | ⬜ boş | — | — |
| BP-02 | KOBİ Ar-Ge | — | — | ⬜ boş | — | — |
| BP-03 | Üniversite TTO | — | — | ⬜ boş | — | — |
| BP-04 | Üniversite TTO | — | — | ⬜ boş | — | — |
| BP-05 | Danışmanlık | — | — | ⬜ boş | — | — |
| BP-06 | Danışmanlık | — | — | ⬜ boş | — | — |
| BP-07 | Araştırma merkezi | — | — | ⬜ boş | — | — |
| BP-08 | Araştırma merkezi | — | — | ⬜ boş | — | — |
| BP-09 | Serbest (yedek) | — | — | ⬜ boş | — | — |
| BP-10 | Serbest (yedek) | — | — | ⬜ boş | — | — |

Durum değerleri: `⬜ boş` → `📨 davet edildi` → `🟡 onboarding` → `🟢 aktif` → `⚪ ayrıldı`

## Ortak başına onboarding kontrol listesi

Her slot için kopyalanır:

```
### BP-0X · <profil>
- [ ] Kiracı + çalışma alanı açıldı (ülke, kurum tipi doğru)
- [ ] Ekip planı yetkileri + 500 YZ kredisi tanımlandı
- [ ] DPA gönderildi ve karşılıklı onaylandı
- [ ] Davet e-postası + BETA_GUIDE (tr/en) iletildi
- [ ] İlk giriş yapıldı (Gün 1 adımları tamam)
- [ ] En az 2 ekip üyesi davet edildi, roller atandı
- [ ] Hafta 1 çıkış kriteri: 1 fırsat G1'de ve panelde görünüyor
- [ ] Haftalık sync takvimi (ICS) kabul edildi
- [ ] Baz çizgi KPI'ları kaydedildi (toplam teklif, kişi-gün, G0→G2)
```

## Haftalık katılım ve geri bildirim

| Slot | H1 | H2 | H3 | H4 | H5 | H6 | H7 | H8 | Geri bildirim (adet) |
|---|---|---|---|---|---|---|---|---|---|
| BP-01 | | | | | | | | | 0 |
| BP-02 | | | | | | | | | 0 |
| BP-03 | | | | | | | | | 0 |
| BP-04 | | | | | | | | | 0 |
| BP-05 | | | | | | | | | 0 |
| BP-06 | | | | | | | | | 0 |
| BP-07 | | | | | | | | | 0 |
| BP-08 | | | | | | | | | 0 |
| BP-09 | | | | | | | | | 0 |
| BP-10 | | | | | | | | | 0 |

İşaretler: `✅` katıldı · `📝` asenkron form · `—` katılmadı

## Risk sinyalleri (haftalık gözden geçir)

- Üst üste 2 hafta katılmayan ortak → doğrudan iletişim, gerekirse yedek slottan (BP-09/10) değişim.
- Hafta 3 sonunda hâlâ G1'e geçmemiş ortak → onboarding sorunu olarak ele alınır, ürün sorunu olarak değil.
- Geri bildirimi yalnız tek profilden gelen konu → diğer profillerde teyit edilmeden yol haritasına alınmaz.
