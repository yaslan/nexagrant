/**
 * E11.4 — renders `docs/E11-PRICING-FEEDBACK.md` from the analysis output.
 *
 * Pure: data in, Markdown out. The document is generated rather than hand-written
 * so that re-running the analysis on the real week-7 responses cannot leave a stale
 * paragraph behind, and so the transition table can never disagree with
 * `pricing-transition.ts`.
 *
 * Turkish, like the rest of `docs/` — the audience is the team, and BETA_GUIDE.md
 * sets the precedent (an English cut is a separate deliverable if partners ask).
 */

import {
  formatEur,
  formatPct,
  type DemandCount,
  type PricingReportData,
  type SegmentSummary,
} from './pricing-analysis';
import {
  BETA_CHECKIN_TOTAL,
  BETA_ENDS_ON,
  CATALOGUE_LIST_CENTS,
  DORMANCY_FORFEIT_DAYS,
  GA_DATE,
  PILOT_GRACE_DAYS,
  POST_LOCK_ANNUAL_UPLIFT_CAP_PCT,
  PRICE_CHANGE_NOTICE_DAYS,
  TRANSITION_TIERS,
  resolveBetaTransition,
} from './pricing-transition';

export interface ReportContext {
  generatedAt: string;
  /** Repo-relative path of the CSV the numbers come from. */
  sourcePath: string;
  /** Partners the survey went out to — the denominator for the response rate. */
  invited: number;
  /** Plan the Van Westendorp and Gabor-Granger questions were anchored on. */
  anchorPlanId: string;
}

const SEGMENT_TR: Record<string, string> = {
  sme: 'KOBİ / Ar-Ge',
  university: 'Üniversite / TTO',
  consultancy: 'Danışmanlık',
  other: 'Diğer',
};

const PLAN_TR: Record<string, string> = {
  free: 'Keşif',
  starter: 'Başlangıç',
  team: 'Ekip',
  business: 'İşletme',
  enterprise: 'Kurumsal',
  none: 'Hiçbiri',
};

const LABEL_TR: Record<string, string> = {
  ...PLAN_TR,
  ...SEGMENT_TR,
  yes: 'Yeter',
  no: 'Yetmez',
  unsure: 'Bilmiyorum',
  monthly: 'Aylık',
  annual: 'Yıllık',
  annual_only: 'Yalnız yıllık',
  EUR: 'Euro',
  TRY: 'Türk lirası',
  either: 'Fark etmez',
  accept: 'Kabul',
  conditional: 'Koşullu',
  reject: 'Ret',
  addon_m6: 'Evaluator Lens (M6) €99',
  addon_m11: 'Full Application (M11) €149',
  addon_m7: 'TTO Accelerator (M7) €129',
  addon_m8_pro: 'Consortium Matching Pro (M8) €79',
  addon_workspace: 'Ek çalışma alanı €49',
  addon_credits_250: '250 kredi €49',
};

const label = (key: string): string => LABEL_TR[key] ?? key;

function demandTable(rows: readonly DemandCount[], firstHeader: string): string[] {
  if (rows.length === 0) return ['_Yanıt yok._', ''];
  const out = [`| ${firstHeader} | Yanıt | Pay |`, '|---|---:|---:|'];
  for (const row of rows) out.push(`| ${label(row.key)} | ${row.count} | ${formatPct(row.share)} |`);
  out.push('');
  return out;
}

function segmentTable(segments: readonly SegmentSummary[]): string[] {
  if (segments.length === 0) return ['_Yanıt yok._', ''];
  const out = [
    '| Segment | n | Kabul edilebilir (medyan) | Çok pahalı (medyan) | Bugünkü dış harcama | Koltuk | Çalışma alanı | İstenen indirim | Ödeme olasılığı |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const s of segments) {
    out.push(
      `| ${label(s.segment)} | ${s.n} | ${formatEur(s.medianAcceptableCents)} | ${formatEur(
        s.medianTooExpensiveCents
      )} | ${formatEur(s.medianCurrentSpendCents)} | ${s.medianSeats ?? '—'} | ${s.medianWorkspaces ?? '—'} | ${
        s.medianDiscountAskPct === null ? '—' : `%${s.medianDiscountAskPct}`
      } | ${s.meanPayLikelihood === null ? '—' : s.meanPayLikelihood.toFixed(1)}/10 |`
    );
  }
  out.push('');
  return out;
}

/**
 * Readings of the data, each stated together with the number it rests on.
 *
 * These are conditional restatements of the measurements, not judgements — the
 * judgement is the transition policy below, which a human wrote. Keeping them
 * rule-based means the section regenerates correctly when the real responses land
 * instead of describing a dataset that is no longer there.
 */
function findings(data: PricingReportData, anchorCents: number): string[] {
  const out: string[] = [];
  const { vw, gg } = data;

  if (vw.oppCents !== null) {
    const delta = (vw.oppCents - anchorCents) / anchorCents;
    out.push(
      `- **Optimal fiyat noktası ${formatEur(vw.oppCents)}**, liste fiyatının (${formatEur(anchorCents)}) ` +
        `${delta >= 0 ? '%' + (delta * 100).toFixed(0) + ' üzerinde' : '%' + Math.abs(delta * 100).toFixed(0) + ' altında'}. ` +
        (Math.abs(delta) <= 0.1
          ? 'Fark %10’un altında — fiyat değişikliği için bu ankette gerekçe yok.'
          : delta < 0
            ? 'Liste fiyatı optimal noktanın belirgin üstünde; ya fiyat ya da paketleme (koltuk, kredi) gözden geçirilmeli.'
            : 'Liste fiyatı optimal noktanın belirgin altında; ödemeye razı olunan tutarın bir kısmı masada kalıyor.')
    );
  }
  if (vw.pmcCents !== null && vw.pmeCents !== null) {
    out.push(
      `- **Kabul edilebilir fiyat aralığı ${formatEur(vw.pmcCents)} – ${formatEur(vw.pmeCents)}.** ` +
        `${anchorCents >= vw.pmcCents && anchorCents <= vw.pmeCents ? 'Ekip planı bu aralığın içinde.' : 'Ekip planı bu aralığın DIŞINDA.'}`
    );
  }
  if (gg.bestPriceCents !== null) {
    const best = gg.ladder.find((r) => r.priceCents === gg.bestPriceCents);
    out.push(
      `- **Gabor-Granger geliri ${formatEur(gg.bestPriceCents)} basamağında maksimum** ` +
        `(kabul %${((best?.acceptance ?? 0) * 100).toFixed(0)}, ${best?.buyers ?? 0}/${gg.n} yanıt). ` +
        'Bu bir talep tahmini değil, sabit örneklem üzerinde gelir endeksidir.'
    );
  }
  if (gg.nonMonotonic.length > 0) {
    out.push(
      `- ⚠️ ${gg.nonMonotonic.length} yanıt merdivende tutarsız (düşük fiyata hayır, yüksek fiyata evet): ` +
        `${gg.nonMonotonic.join(', ')}. Bu yanıtlar merdiven yorumunu zayıflatır; atölyede teyit edilmeli.`
    );
  }

  const notEnough = data.creditsEnough.find((c) => c.key === 'no');
  if (notEnough && notEnough.share >= 0.3) {
    out.push(
      `- **Yanıtların %${(notEnough.share * 100).toFixed(0)}’si 500 aylık krediyi yetersiz buluyor.** ` +
        'Kredi paketi (`addon_credits_250`) bir kurtarma satışı değil, planın parçası olmak zorunda kalabilir.'
    );
  }
  const annualOnly = data.billingCycle.find((c) => c.key === 'annual_only');
  if (annualOnly && annualOnly.count > 0) {
    out.push(
      `- ${annualOnly.count} ortak **yalnız yıllık** satın alabiliyor (%${(annualOnly.share * 100).toFixed(0)}). ` +
        'Aylık-öncelikli bir Checkout akışı bu ortaklar için satın alma engeli.'
    );
  }
  if (data.eInvoiceShare > 0) {
    out.push(
      `- **E-fatura ihtiyacı: yanıtların %${(data.eInvoiceShare * 100).toFixed(0)}’si.** ` +
        'BILLING.md §4’te faz 2’ye bırakılan e-fatura entegrasyonu bu orana göre yeniden önceliklendirilmeli.'
    );
  }
  const tryPref = data.currencyPref.find((c) => c.key === 'TRY');
  if (tryPref && tryPref.count > 0) {
    out.push(
      `- ${tryPref.count} ortak TL faturalama istiyor (%${(tryPref.share * 100).toFixed(0)}) — ` +
        'iyzico/TL fiyat listesi (BILLING.md §4) beta sonrası ilk 90 günün konusu.'
    );
  }
  const reject = data.successFee.find((c) => c.key === 'reject');
  const accept = data.successFee.find((c) => c.key === 'accept');
  out.push(
    `- **Başarı primi:** ${accept?.count ?? 0} kabul · ${
      data.successFee.find((c) => c.key === 'conditional')?.count ?? 0
    } koşullu · ${reject?.count ?? 0} ret. ` +
      'ROADMAP “Açık kararlar” #6 bu satırla kapanmaz ama yönü belirlenir.'
  );
  if (data.medianDiscountAskPct !== null) {
    out.push(
      `- **İstenen indirimin medyanı %${data.medianDiscountAskPct}, 75. yüzdeliği %${data.discountAskP75Pct}.** ` +
        `Aşağıdaki “founding” kademesi (%${TRANSITION_TIERS[0]?.discountPct ?? 0}) bu iki değeri de karşılıyorsa ` +
        'geçişte pazarlık beklenmez.'
    );
  }
  out.push(
    `- **Ödeme olasılığı ortalaması ${data.meanPayLikelihood === null ? '—' : data.meanPayLikelihood.toFixed(1)}/10**, ` +
      `8+ veren pay %${(data.committedShare * 100).toFixed(0)}.`
  );
  return out;
}

function statusBanner(data: PricingReportData, ctx: ReportContext): string[] {
  if (data.status === 'REAL') {
    return [
      `> **Veri: gerçek beta yanıtları** · ${data.n}/${ctx.invited} ortak · kaynak \`${ctx.sourcePath}\``,
      '',
    ];
  }
  if (data.status === 'FIXTURE') {
    return [
      '> ## ⚠️ BU RAPORDAKİ SAYILAR GERÇEK ORTAK YANITI DEĞİLDİR',
      '>',
      `> Kaynak dosya kendini **FIXTURE** olarak işaretliyor (\`${ctx.sourcePath}\`).` +
        (data.statusNote ? ` Not: ${data.statusNote}` : ''),
      '>',
      '> Bu çalıştırma **analiz hattını uçtan uca doğrulamak** içindir: anket tanımı → CSV → istatistik → rapor.',
      `> Gerçek yanıtlar 7. hafta atölyesinde (2026-10-22) toplanır; rapor o CSV ile yeniden üretilir ve bu ` +
        'uyarı kendiliğinden kalkar.',
      '>',
      '> **Bu sayılara dayanarak fiyat kararı alınmaz.** Aşağıdaki “v1.0 → v1.1 geçiş kuralı” bölümü ise ' +
        'ankete bağlı değildir; o bir politika kararıdır ve bugün geçerlidir.',
      '',
    ];
  }
  return [
    `> ⚠️ Kaynak CSV \`# STATUS:\` satırı taşımıyor (\`${ctx.sourcePath}\`), veri gerçek mi fikstür mü ` +
      'beyan edilmemiş. Dosyanın başına `# STATUS: REAL` ya da `# STATUS: FIXTURE` ekleyin.',
    '',
  ];
}

export function renderPricingReport(data: PricingReportData, ctx: ReportContext): string {
  const anchor = CATALOGUE_LIST_CENTS[ctx.anchorPlanId]?.monthly ?? 24900;
  const out: string[] = [];

  out.push('# E11.4 — Fiyat doğrulama: beta ortağı geri bildirimi');
  out.push('');
  out.push(
    `> Üretildi: ${ctx.generatedAt} · Kaynak: \`${ctx.sourcePath}\` · ` +
      'Yeniden üret: `pnpm beta:pricing --analyze --responses=<csv>`'
  );
  out.push('>');
  out.push(
    '> Bu dosya **üretilir**, elle düzenlenmez. Metin değişikliği ' +
      '`src/lib/beta/pricing-report.ts`, politika değişikliği `src/lib/beta/pricing-transition.ts` içinde yapılır.'
  );
  out.push('');
  out.push(...statusBanner(data, ctx));

  out.push('## 1. Yöntem');
  out.push('');
  out.push(
    `Anket iki standart araç kullanır. **Van Westendorp** dört soruyla, katılımcıya hiçbir rakam ` +
      `göstermeden kabul edilebilir fiyat bandını çıkarır. **Gabor-Granger** ise sabit bir merdivende ` +
      `(${[14900, 19900, 24900, 29900, 34900].map((c) => formatEur(c)).join(' · ')}) her fiyatı bağımsız sorar ve ` +
      `sabit örneklem üzerinde gelir endeksi verir. İkisi de bir karar değildir; bir kararı sınırlar.`
  );
  out.push('');
  out.push(
    `Çapa plan: **${label(ctx.anchorPlanId)}** (liste ${formatEur(anchor)}/ay). Tüm tutarlar aylık, KDV hariç, EUR.`
  );
  out.push('');
  out.push(
    'Van Westendorp hijyeni: dört fiyatı sıralı vermeyen (`çok ucuz ≤ ucuz ≤ pahalı ≤ çok pahalı`) yanıt ' +
      'eğrileri ters yönde keseceği için **reddedilir ve gerekçesiyle raporlanır** — sessizce düşmez.'
  );
  out.push('');

  out.push('## 2. Katılım');
  out.push('');
  out.push(`- Davet edilen ortak: **${ctx.invited}**`);
  out.push(
    `- Geçerli yanıt: **${data.n}**` +
      (ctx.invited > 0 ? ` (%${((data.n / ctx.invited) * 100).toFixed(0)})` : '')
  );
  out.push(`- Reddedilen satır: **${data.rejected.length}**`);
  out.push('');
  if (data.rejected.length > 0) {
    out.push('| Satır | Yanıtlayan | Gerekçe |');
    out.push('|---:|---|---|');
    for (const r of data.rejected) out.push(`| ${r.row} | ${r.respondentId} | ${r.reason} |`);
    out.push('');
  }
  const target = 8;
  if (data.n < target) {
    out.push(
      `> ⚠️ Kabul kriteri ≥${target} yanıt; şu an ${data.n}. Bu örneklemle segment kırılımları yön gösterir, ` +
        'karar vermez.'
    );
    out.push('');
  }

  out.push('## 3. Van Westendorp — kabul edilebilir fiyat bandı');
  out.push('');
  out.push('| Ölçüt | Değer | Ne demek |');
  out.push('|---|---:|---|');
  out.push(
    `| PMC — marjinal ucuzluk | ${formatEur(data.vw.pmcCents)} | Bunun altında kalite şüphesi kelepir hissini bastırır |`
  );
  out.push(`| OPP — optimal fiyat | ${formatEur(data.vw.oppCents)} | Toplam reddin en düşük olduğu nokta |`);
  out.push(`| IPP — kayıtsızlık | ${formatEur(data.vw.ippCents)} | “Ucuz” ve “pahalı” diyenlerin eşitlendiği nokta |`);
  out.push(
    `| PME — marjinal pahalılık | ${formatEur(data.vw.pmeCents)} | Bunun üstünde direnç değeri bastırır |`
  );
  out.push('');
  if (data.vw.curve.length > 0) {
    out.push('<details><summary>Eğri noktaları (kümülatif paylar)</summary>');
    out.push('');
    out.push('| Fiyat | Çok ucuz | Ucuz | Pahalı | Çok pahalı |');
    out.push('|---:|---:|---:|---:|---:|');
    for (const p of data.vw.curve) {
      out.push(
        `| ${formatEur(p.priceCents)} | ${formatPct(p.tooCheap)} | ${formatPct(p.cheap)} | ${formatPct(
          p.expensive
        )} | ${formatPct(p.tooExpensive)} |`
      );
    }
    out.push('');
    out.push('</details>');
    out.push('');
  }

  out.push('## 4. Gabor-Granger — fiyat merdiveni');
  out.push('');
  out.push('| Fiyat | Alırım | Kabul | Gelir endeksi |');
  out.push('|---:|---:|---:|---:|');
  for (const rung of data.gg.ladder) {
    const star = rung.priceCents === data.gg.bestPriceCents ? ' ⭐' : '';
    out.push(
      `| ${formatEur(rung.priceCents)}${star} | ${rung.buyers}/${data.gg.n} | ${formatPct(
        rung.acceptance
      )} | ${formatEur(rung.revenueIndexCents)} |`
    );
  }
  out.push('');
  out.push('⭐ = sabit örneklemde gelir endeksinin en yüksek olduğu basamak.');
  out.push('');

  out.push('## 5. Segment kırılımı');
  out.push('');
  out.push(...segmentTable(data.segments));

  out.push('## 6. Plan seçimi');
  out.push('');
  out.push(...demandTable(data.planMix, 'Plan'));

  out.push('## 7. Eklenti talebi');
  out.push('');
  out.push(...demandTable(data.addonDemand, 'Eklenti'));
  out.push('### YZ kredisi yeterliliği (Ekip planı, 500/ay)');
  out.push('');
  out.push(...demandTable(data.creditsEnough, '500 kredi yeterli mi?'));

  out.push('## 8. Faturalama');
  out.push('');
  out.push('### Döngü');
  out.push('');
  out.push(...demandTable(data.billingCycle, 'Döngü'));
  out.push('### Para birimi');
  out.push('');
  out.push(...demandTable(data.currencyPref, 'Tercih'));
  out.push(`E-fatura/e-arşiv ihtiyacı bildiren: **${formatPct(data.eInvoiceShare)}**`);
  out.push('');
  out.push('### Başarı primi');
  out.push('');
  out.push(...demandTable(data.successFee, 'Tutum'));

  out.push('## 9. Bulgular');
  out.push('');
  out.push(...findings(data, anchor));
  out.push('');

  if (data.comments.length > 0) {
    out.push('## 10. Serbest yorumlar');
    out.push('');
    for (const c of data.comments) out.push(`- **${c.respondentId}** (${label(c.segment)}): “${c.comment}”`);
    out.push('');
  }

  out.push('## 11. v1.0 → v1.1 geçiş kuralı');
  out.push('');
  out.push(
    `Beta ${BETA_ENDS_ON} tarihinde kapanır; ücretli sürüm **${GA_DATE}** tarihinde başlar. Aradaki iki hafta ` +
      'kapanış raporu ve imzalı teklif içindir — ilk fatura öncesinde ortağın elinde yazılı koşul olur.'
  );
  out.push('');
  out.push(
    'Kademe **harcamaya değil katılıma** bağlıdır: indirimin karşılığı, ortağın betada verdiği kullanım ve ' +
      'kalibrasyon verisidir.'
  );
  out.push('');
  out.push('| Kademe | Koşul | İndirim | Süre | Fiyat kilidi | Hoş geldin kredisi |');
  out.push('|---|---|---:|---:|---:|---:|');
  for (const t of TRANSITION_TIERS) {
    const cond =
      t.minCheckins === 0 && !t.requiresG2
        ? 'Diğer tüm beta ortakları'
        : `${t.minCheckins}/${BETA_CHECKIN_TOTAL} sync${t.requiresG2 ? ' **ve** ≥1 teklif G2’de' : ''}`;
    out.push(
      `| \`${t.tier}\` | ${cond} | **%${t.discountPct}** | ${t.discountMonths} ay | ${
        t.priceLockMonths > 0 ? `${t.priceLockMonths} ay` : '—'
      } | ${t.welcomeCredits || '—'} |`
    );
  }
  out.push('');
  out.push('### Kuralın tamamı');
  out.push('');
  out.push(
    `1. **İndirim** seçilen planın ve döngünün **liste fiyatına** uygulanır. Yıllık listede zaten var olan ` +
      '%20 (BILLING.md §1) yeniden uygulanmaz — faturada tek bir indirim satırı görünür, mutabakat yapılabilir.'
  );
  out.push(
    `2. **Fiyat kilidi (grandfathering):** kilit süresince v1.1 liste zammı bu kiracıya ulaşmaz. Kilit bitince ` +
      `artış 12 ayda en çok **%${POST_LOCK_ANNUAL_UPLIFT_CAP_PCT}** olabilir ve **${PRICE_CHANGE_NOTICE_DAYS} gün** ` +
      'önceden yazılı bildirilir (BILLING.md §4’teki TL bildirim süresiyle aynı).'
  );
  out.push(
    `3. **Pilot modüller:** betada \`pilot\` açılmış olup satın alınan planın kapsamı dışında kalan modüller ` +
      `GA’dan sonra **${PILOT_GRACE_DAYS} gün** daha \`pilot\` kalır, sonra \`off\` olur. Veri silinmez. ` +
      'Kademeli kapanış `src/core/modules/state-machine.ts` üzerinden yürür, UI kopyalamaz.'
  );
  out.push(
    '4. **Krediler:** beta kredileri devretmez (ücretsizdi). Yerine kademeye bağlı tek seferlik hoş geldin ' +
      'kredisi tanımlanır.'
  );
  out.push(
    '5. **Yükseltme indirimi taşır:** ortak üst plana geçerse aynı yüzde yeni planın liste fiyatına uygulanır — ' +
      'büyümek indirimi kaybettirmez.'
  );
  out.push(
    `6. **Atalet:** kiracı üst üste **${DORMANCY_FORFEIT_DAYS} gün** \`free\` planda kalırsa kademe düşer; fiyat ` +
      'kilidi yıllar sonra uyandırılacak bir varlık değildir.'
  );
  out.push(
    '7. **Devredilemez:** birleşme/satın alma hâlinde kademe yeni tüzel kişiye geçmez; sözleşme yenilenir.'
  );
  out.push(
    '8. **v1.1 içerik artışı:** v1.1 ile İşletme planına giren M6/M9 (ROADMAP Faz B) kilitli ortaklara ' +
      '**kilitli fiyattan** açılır; içerik artışı zam gerekçesi olarak onlara yansıtılmaz.'
  );
  out.push('');

  out.push('### Örnek teklifler (Ekip planı)');
  out.push('');
  out.push('| Kademe | Döngü | Liste | Ödenecek | Tasarruf | İndirim biter | Kilit biter |');
  out.push('|---|---|---:|---:|---:|---|---|');
  for (const t of TRANSITION_TIERS) {
    for (const cycle of ['monthly', 'annual'] as const) {
      const listCents = CATALOGUE_LIST_CENTS['team']?.[cycle] ?? 0;
      const offer = resolveBetaTransition({
        checkinsAttended: t.minCheckins === 0 ? 1 : t.minCheckins,
        reachedG2: t.requiresG2,
        planId: 'team',
        listCents,
        cycle,
      });
      out.push(
        `| \`${offer.tier}\` | ${cycle === 'monthly' ? 'aylık' : 'yıllık'} | ${formatEur(
          offer.listCents
        )} | **${formatEur(offer.payableCents)}** | ${formatEur(offer.savingCents)} | ${offer.discountEndsOn} | ${
          offer.priceLockEndsOn ?? '—'
        } |`
      );
    }
  }
  out.push('');
  out.push(
    '> Tablo `resolveBetaTransition()` çağrılarak üretilir; teklif mektubu, Stripe kuponu ve yetkilendirme ' +
      'kontrolü aynı fonksiyonu kullandığı sürece üçü ayrışamaz.'
  );
  out.push('');

  out.push('## 12. Açık kalanlar');
  out.push('');
  out.push(
    `- İndirim yüzdeleri gerçek yanıtlarla yeniden ayarlanır: tek değişiklik noktası ` +
      '`TRANSITION_TIERS` (`src/lib/beta/pricing-transition.ts`), testler koruma bandı.'
  );
  out.push(
    '- Stripe tarafı: kademe başına bir `coupon` + `promotion_code`, süresi `discountMonths` kadar `repeating`. ' +
      'Kilit Stripe’ta ifade edilemez — `Subscription` üzerinde `priceLockEndsOn` alanı gerekir (ayrı görev).'
  );
  out.push('- Başarı primi kararı (ROADMAP “Açık kararlar” #6) hukuki görüş beklemektedir; anket yalnızca yön verir.');
  out.push('- TL fiyat listesi ve e-fatura önceliği bu rapordaki paylara göre yeniden sıralanmalıdır.');
  out.push('');
  return out.join('\n');
}
