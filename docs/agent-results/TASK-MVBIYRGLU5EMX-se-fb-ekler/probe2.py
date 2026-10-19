"""FO-21 items 4, 5, 6: input, XSS/CSV, spam/XFF, KVKK columns."""
import csv, io, json, os, re, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import plib as P

log, req, body, sql = P.log, P.req, P.body, P.sql
P.OUT.clear()
sql('delete from "ExpertPreRegistration"; delete from "ExpertPreRegAttempt"')
n = [0]


def xff():
    n[0] += 1
    return {'x-forwarded-for': f'203.0.113.{n[0]}'}


P.sec('4. Girdi')
cases = {
    'unknown province': body('i1@fo21.test', province='99'),
    'unknown area slug': body('i2@fo21.test', expertiseAreas=['<script>']),
    'unknown role slug': body('i3@fo21.test', roles=['admin']),
    'unknown language': body('i4@fo21.test', languages=['xx']),
    'locale de': body('i5@fo21.test', locale='de'),
    'fullName 121': body('i6@fo21.test', fullName='A' * 121),
    'org 201': body('i7@fo21.test', organization='O' * 201),
    'projectCodes 10k': body('i8@fo21.test', projectCodes='P' * 10000),
    'email 300': body('a' * 290 + '@fo21.test'),
    'email CRLF': body('x@fo21.test\r\nBcc: e@evil.test'),
    'linkedin javascript:': body('i9@fo21.test', linkedinUrl='javascript:alert(1)//linkedin.com'),
    'linkedin evil host': body('i10@fo21.test', linkedinUrl='https://linkedin.com.evil.test/x'),
    'kvkk false': body('i11@fo21.test', kvkkAccepted=False),
    'kvkk "true" string': body('i12@fo21.test', kvkkAccepted='true'),
    'visibility missing': {k: v for k, v in body('i13@fo21.test').items() if k != 'visibilityConsent'},
    'areas 9 items': body('i14@fo21.test', expertiseAreas=['climate-environment'] * 9),
    'extra field status=verified,founderNumber=1': body('i15@fo21.test', status='verified', founderNumber=1, emailVerifiedAt='2020-01-01'),
}
for name, b in cases.items():
    st, _, tx = req('POST', '/api/expert-preregistration', b, headers=xff())
    log(f'{name:45} -> {st} {tx[:120]}')
log('i15 stored status/founder:', sql("select status, coalesce(\"founderNumber\"::text,'null') from \"ExpertPreRegistration\" where email='i15@fo21.test'"))
for name, raw in [('not json', b'{bad'), ('json array', b'[1,2]'), ('json null', b'null')]:
    st, _, tx = req('POST', '/api/expert-preregistration', raw=raw, headers=xff())
    log(f'{name:45} -> {st} {tx[:120]}')
big = json.dumps(body('big@fo21.test', referredBy='R' * 120, utmSource='x' * 100, pad='Z' * (8 * 1024 * 1024))).encode()
t0 = time.time()
st, _, tx = req('POST', '/api/expert-preregistration', raw=big, headers=xff(), timeout=120)
log(f'8 MiB body (unknown key pad) -> {st} {tx[:80]} in {time.time()-t0:.2f}s')

P.sec('4b. XSS + CSV injection (kayit -> admin tablo/CSV)')
payloads = {
    'x1@fo21.test': dict(fullName='<script>alert(1)</script><img src=x onerror=alert(2)>', organization='"><svg onload=alert(3)>'),
    'x2@fo21.test': dict(fullName='=HYPERLINK("http://evil.test","tikla")', organization='+cmd|\' /C calc\'!A0'),
    'x3@fo21.test': dict(fullName='-2+3', organization='@SUM(1+1)*cmd|\'/C calc\'!A0'),
    'x4@fo21.test': dict(fullName='Ali Veli;=HYPERLINK("http://evil.test";"x")', organization='Kurum;=1+1'),
    'x5@fo21.test': dict(fullName='  =1+1', organization='\t=1+1'),
    'x6@fo21.test': dict(fullName='Ayse "=1+1"', organization='Kurum,=1+1'),
}
for em, over in payloads.items():
    st, _, tx = req('POST', '/api/expert-preregistration', body(em, **over), headers=xff())
    log(f'register {em} -> {st} {tx[:60]}')
log('stored (fullName | organization):')
for line in sql("select email, \"fullName\", organization from \"ExpertPreRegistration\" where email like 'x%' order by email").splitlines():
    log('   ', repr(line))
cookie = {'cookie': f'authjs.session-token={P.JWT["u-admin"]}'}
st, _, html = req('GET', '/tr/admin/uzman-kayitlari', headers=cookie)
log('admin page', st, '| raw <script>alert(1) present:', '<script>alert(1)' in html,
    '| escaped &lt;script&gt; present:', '&lt;script&gt;alert(1)' in html, '| raw <svg onload present:', '<svg onload' in html)
st, _, text = req('GET', '/api/admin/expert-preregistrations/export.csv', headers=cookie)
open(os.path.join(P.S, 'export.csv'), 'w').write(text)
log('CSV', st)
for line in text.splitlines():
    if '@fo21.test' in line and line.split(',')[1 if not line.startswith('"') else 0]:
        pass
for line in text.splitlines():
    if re.search(r'x\d@fo21', line):
        log('   csv line:', repr(line[:140]))
log('Comma-delimited reader (Excel en-US / LibreOffice default) cells starting with = + - @:')
for row in csv.reader(io.StringIO(text.lstrip('﻿'))):
    bad = [c for c in row if re.match(r'^[=+\-@]', c)]
    if bad:
        log('    !!', bad)
log('Semicolon-delimited reader (Excel tr-TR liste ayirici ";") cells starting with = + - @:')
for row in csv.reader(io.StringIO(text.lstrip('﻿')), delimiter=';'):
    bad = [c for c in row if re.match(r'^[=+\-@]', c)]
    if bad:
        log('    !!', bad)

P.sec('5. Spam / kotuye kullanim')
st, _, tx = req('POST', '/api/expert-preregistration', {**body('hp@fo21.test'), 'website': 'http://spam'}, headers=xff())
log('honeypot ->', st, tx, '| row stored:', sql("select count(*) from \"ExpertPreRegistration\" where email='hp@fo21.test'"),
    '| mail sent:', any(t['Address'] == 'hp@fo21.test' for m in P.mails() for t in m['To']))
# same client IP (rightmost entry, what our proxy appends), forged leftmost entries
res = []
for i in range(7):
    st, _, _ = req('POST', '/api/expert-preregistration', body(f'r{i}@fo21.test'), headers={'x-forwarded-for': f'10.9.{i}.{i}, 192.0.2.50'})
    res.append(st)
log('same proxy-seen IP 192.0.2.50, forged left entries rotate ->', res)
res = []
for i in range(7):
    st, _, _ = req('POST', '/api/expert-preregistration', body(f's{i}@fo21.test'), headers={'x-forwarded-for': f'192.0.2.{100+i}'})
    res.append(st)
log('rightmost entry rotates (only possible when app is reachable WITHOUT our proxy) ->', res)
res = []
for i in range(7):
    st, _, _ = req('POST', '/api/expert-preregistration', body(f'n{i}@fo21.test'))
    res.append(st)
log('no X-Forwarded-For header at all ->', res, '| ipHash null rows:', sql("select count(*) from \"ExpertPreRegistration\" where email like 'n_@fo21.test' and \"ipHash\" is null"))
res = []
for i in range(7):
    st, _, _ = req('POST', '/api/expert-preregistration', body(f'v{i}@fo21.test'), headers={'x-forwarded-for': f'2001:db8:1:2:{i:x}::1'})
    res.append(st)
log('IPv6 same /64 rotating host part ->', res)
res = []
for i in range(7):
    st, _, _ = req('POST', '/api/expert-preregistration', body(f'j{i}@fo21.test'), headers={'x-forwarded-for': f'junk-{i}'})
    res.append(st)
log('rightmost entry not an IP (junk-N) ->', res)

P.sec('6. KVKK kolonlari')
cols = sql("select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_name='ExpertPreRegistration'")
log('columns:', cols)
log('any column named like ip (besides ipHash):', [c for c in cols.split(',') if 'ip' in c.lower() and c != 'ipHash'])
log('raw IP text in any row:', sql("select count(*) from \"ExpertPreRegistration\" r where r::text like '%203.0.113.%' or r::text like '%192.0.2.%'"))
log('ipHash sample length:', sql("select length(\"ipHash\") from \"ExpertPreRegistration\" where \"ipHash\" is not null limit 1"))
st, _, tx = req('POST', '/api/expert-preregistration', body('k1@fo21.test', marketingConsent=True), headers=xff())
log('k1 (marketing=true):', sql("select \"kvkkAcceptedAt\" is not null, \"visibilityConsentAt\" is not null, \"marketingConsentAt\" is not null, \"consentTextVersion\" from \"ExpertPreRegistration\" where email='k1@fo21.test'"))
st, _, tx = req('POST', '/api/expert-preregistration', body('k2@fo21.test'), headers=xff())
log('k2 (marketing absent):', sql("select \"kvkkAcceptedAt\" is not null, \"visibilityConsentAt\" is not null, \"marketingConsentAt\" is not null, \"consentTextVersion\" from \"ExpertPreRegistration\" where email='k2@fo21.test'"))
st, _, page = req('GET', '/tr/uzman')
boxes = re.findall(r'<input[^>]*type="checkbox"[^>]*>', page)
log('/tr/uzman', st, 'checkboxes in SSR html:', len(boxes), '| any checked:', [b for b in boxes if re.search(r'\bchecked\b', b)])
open(os.path.join(P.S, 'probe-out-2.txt'), 'w').write('\n'.join(P.OUT))
