// Inserted into a scratch copy of tests/public-lead.live.test.ts (not committed as a test)
  // cs-fb İNCELEME-61 (scratch, not committed): the exact edges, 1 ms apart. Rows removed one id at a time.
  test('i61: exact edges — 24 h and 1 h ago still count, 1 ms earlier no longer', async () => {
    const ids: string[] = [];
    const seedId = async (label: string, at: Date, extra: { email?: string; ipHash?: string | null }) => {
      await seed(label, at, extra);
      const r = await admin.publicLead.findFirst({ where: { email: extra.email ?? mail(label), createdAt: at }, orderBy: { id: 'desc' } });
      return r!.id;
    };
    const verdicts: string[] = [];
    for (let i = 0; i < PUBLIC_LEAD_EMAIL_LIMIT; i++) ids.push(await seedId(`e-at${i}`, new Date(NOW.getTime() - DAY), { email: mail('e-at') }));
    verdicts.push('mail@-24h:' + JSON.stringify(await submitPublicLead(form({ email: mail('e-at') }), { ip: '192.0.2.80', now: NOW, secret: SECRET })));
    for (let i = 0; i < PUBLIC_LEAD_EMAIL_LIMIT; i++) ids.push(await seedId(`e-before${i}`, new Date(NOW.getTime() - DAY - 1), { email: mail('e-before') }));
    verdicts.push('mail@-24h-1ms:' + JSON.stringify(await submitPublicLead(form({ email: mail('e-before') }), { ip: '192.0.2.81', now: NOW, secret: SECRET })));
    const hAt = hashClientIp('192.0.2.82', SECRET);
    for (let i = 0; i < PUBLIC_LEAD_IP_LIMIT; i++) ids.push(await seedId(`i-at${i}`, new Date(NOW.getTime() - HOUR), { ipHash: hAt }));
    verdicts.push('ip@-1h:' + JSON.stringify(await submitPublicLead(form({ email: mail('i-at-new') }), { ip: '192.0.2.82', now: NOW, secret: SECRET })));
    const hBefore = hashClientIp('192.0.2.83', SECRET);
    for (let i = 0; i < PUBLIC_LEAD_IP_LIMIT; i++) ids.push(await seedId(`i-before${i}`, new Date(NOW.getTime() - HOUR - 1), { ipHash: hBefore }));
    verdicts.push('ip@-1h-1ms:' + JSON.stringify(await submitPublicLead(form({ email: mail('i-before-new') }), { ip: '192.0.2.83', now: NOW, secret: SECRET })));
    console.log('I61 EDGES ' + verdicts.join(' | '));
    const created = await admin.publicLead.findMany({ where: { email: { in: [mail('e-at'), mail('e-before'), mail('i-at-new'), mail('i-before-new')] }, id: { notIn: ids } } });
    let del = 0;
    for (const id of [...ids, ...created.map((r) => r.id)]) del += (await admin.publicLead.deleteMany({ where: { id } })).count;
    console.log(`I61 cleanup: ${del} rows deleted one id at a time`);
    expect(verdicts).toEqual([
      'mail@-24h:{"ok":false,"error":"rate_limited"}',
      'mail@-24h-1ms:{"ok":true}',
      'ip@-1h:{"ok":false,"error":"rate_limited"}',
      'ip@-1h-1ms:{"ok":true}',
    ]);
  });

