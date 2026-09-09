---
name: fabrika-a-passing-test-can-be-satisfied-by-a-second-mechanism
description: Kod tabaninda ayni etkiyi ureten IKINCI bir mekanizma varsa test yesil kalir ama hicbir sey olcmez — kapiyi kabul etmeden once "korudugum sey silinse bu test kirmizi olur mu" diye sor
metadata:
  type: feedback
  updatedAt: 2026-09-09
---

Worker'in yazdigi `tests/e2e/theme-paint-timing.spec.ts` adiyla "script ayristirma aninda calisiyor mu"
iddia ediyordu, ama `waitUntil: 'networkidle'` ile yukleyip sonra `documentElement.classList.contains('dark')`
okuyordu. Ayni sinifi `ThemeProvider`'in `useEffect`'i hidrasyondan sonra ZATEN ekliyor — yani korudugu
script tamamen silinse bile test yesil kalirdi. Kapi, gercekten yasanmis bir regresyonu (commit 53d9c22)
sessizce gecirecekti.

DERS (yeni ve [[fabrika-verify-what-a-gate-measures]]'dan farkli): bir kapinin bos olup olmadigini anlamak
icin script'i okumak YETMEZ — kod tabaninda ayni gozlemlenebilir etkiyi ureten IKINCI bir mekanizma var mi
diye sor. Varsa test iki kaynagi ayirt edemiyordur. Tema/FOUC gibi islerde bu ikinci mekanizma neredeyse
her zaman vardir (init script + provider effect ayni sinifi yazar).

UYGULAMA: her yeni kapi kartina "yikici kanit" maddesi koy — korudugun seyi GECICI olarak kaldir, testin
KIRMIZI oldugunu goster, geri koy ve YESIL oldugunu goster. Tek yonlu yesil kanit kabul etme.
