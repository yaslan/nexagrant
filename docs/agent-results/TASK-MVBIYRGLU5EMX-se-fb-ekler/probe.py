"""FO-21 live probes against the isolated dev server (:3121, fabrika_app, mailpit)."""
import concurrent.futures as cf, hashlib, json, os, re, subprocess, sys, urllib.request, urllib.error

S = os.path.dirname(os.path.abspath(__file__))
BASE = 'http://localhost:3121'
MAIL = 'http://127.0.0.1:55426'
SU = 'postgresql://fabrika:fo21pw@127.0.0.1:55421/fo21'
APP = 'postgresql://fabrika_app:fo21app@127.0.0.1:55421/fo21'
JWT = {k: open(f'{S}/jwt-{k}').read().strip() for k in ['u-admin', 'u-plain', 'u-plain-forged']}
OUT = []


def log(*a):
    line = ' '.join(str(x) for x in a)
    OUT.append(line)
    print(line, flush=True)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


opener = urllib.request.build_opener(NoRedirect)


def req(method, path, body=None, headers=None, raw=None, timeout=60):
    h = {'content-type': 'application/json'} if body is not None or raw is not None else {}
    h.update(headers or {})
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    r = urllib.request.Request(BASE + path, data=data, method=method, headers=h)
    try:
        resp = opener.open(r, timeout=timeout)
        return resp.status, dict(resp.headers), resp.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode('utf-8', 'replace')


def sql(q, url=SU):
    return subprocess.run(['psql', url, '-XAt', '-F', '|', '-c', q], capture_output=True, text=True).stdout.strip() + \
        subprocess.run(['true'], capture_output=True, text=True).stdout


def sql_err(q, url):
    p = subprocess.run(['psql', url, '-XAt', '-c', q], capture_output=True, text=True)
    return (p.stdout + p.stderr).strip()


def mails():
    with urllib.request.urlopen(MAIL + '/api/v1/messages?limit=500') as r:
        return json.load(r)['messages']


def mail_raw(mid):
    with urllib.request.urlopen(f'{MAIL}/api/v1/message/{mid}/raw') as r:
        return r.read().decode('utf-8', 'replace')


def token_for(email):
    for m in mails():
        if any(t['Address'] == email for t in m['To']):
            with urllib.request.urlopen(f"{MAIL}/api/v1/message/{m['ID']}") as r:
                j = json.load(r)
            t = re.search(r'token=([0-9a-f]{64})', j['Text'])
            return t.group(1), mail_raw(m['ID']) + '\n--TEXT--\n' + j['Text'] + '\n--HTML--\n' + j['HTML']
    return None, None


def body(email, **over):
    b = dict(fullName='Deneme Uzman', email=email, province='06', title='Dr.', organization='Kurum A',
             isFreelancer=False, expertiseAreas=['climate-environment'], roles=['coordinator'],
             programmes=['horizon-europe-h2020'], kvkkAccepted=True, visibilityConsent=True, locale='tr')
    b.update(over)
    return b


_ip = [10]


def ip():
    _ip[0] += 1
    return {'x-forwarded-for': f'198.51.100.{_ip[0]}'}


def sec(t):
    log('\n=== ' + t + ' ===')


# ---------------------------------------------------------------- 1 access
sec('1. RLS / erisim')
log('app role select (scope disi):', sql_err('select count(*) from "ExpertPreRegistration"', APP))
log('app role insert (scope disi):', sql_err("insert into \"ExpertPreRegistration\"(id,\"fullName\",email,province,\"kvkkAcceptedAt\",\"visibilityConsentAt\",\"consentTextVersion\",\"updatedAt\") values ('x','x','x@x','06',now(),now(),'v',now())", APP)[:160])
for who in [None, 'u-plain', 'u-plain-forged', 'u-admin']:
    h = {'cookie': f'authjs.session-token={JWT[who]}'} if who else {}
    st, hd, tx = req('GET', '/api/admin/expert-preregistrations/export.csv', headers=h)
    log(f'CSV  {who or "anon":15} -> {st} {hd.get("content-type") or hd.get("Content-Type")} {tx[:70]!r}')
    st, hd, tx = req('GET', '/tr/admin/uzman-kayitlari', headers=h)
    log(f'PAGE {who or "anon":15} -> {st} loc={hd.get("location") or hd.get("Location")} has-table={"ep-admin-csv" in tx}')

# ---------------------------------------------------------------- 2 token + 7 mail
sec('2+7. Token / e-posta')
st, _, tx = req('POST', '/api/expert-preregistration', body('a1@fo21.test', fullName='Ali\r\nBcc: evil@attacker.test\r\nX-Inj: 1'),
                headers={**ip(), 'host': 'evil.attacker.test', 'x-forwarded-host': 'evil.attacker.test', 'x-forwarded-proto': 'https'})
log('register a1 (Host+XFH evil, CRLF in name) ->', st, tx)
tokA, rawA = token_for('a1@fo21.test')
log('mail a1 token found:', bool(tokA))
if rawA:
    links = re.findall(r'https?://[^\s"<>]+verify\?token=', rawA)
    log('link origins in mail:', sorted(set(links)))
    hdr = rawA.split('\r\n\r\n', 1)[0]
    log('mail headers containing Bcc/X-Inj/evil:', [l for l in hdr.splitlines() if re.search(r'(?i)^(bcc|x-inj)|evil', l)])
    log('Subject line:', [l for l in hdr.splitlines() if l.lower().startswith('subject')])
    m = [x for x in mails() if any(t['Address'] == 'a1@fo21.test' for t in x['To'])][0]
    log('recipients To/Cc/Bcc:', [t['Address'] for t in m['To']], m.get('Cc'), m.get('Bcc'))
row = sql("select \"verifyTokenHash\", \"verifyTokenExpiresAt\" - \"createdAt\", \"ipHash\" is not null from \"ExpertPreRegistration\" where email='a1@fo21.test'")
log('db row (hash, ttl, ipHash set):', row)
log('sha256(raw)==stored:', hashlib.sha256(tokA.encode()).hexdigest() == row.split('|')[0])
log('raw token anywhere in row text:', sql(f"select count(*) from \"ExpertPreRegistration\" r where r::text like '%{tokA}%'"))

def verify(t, extra=None):
    st, hd, _ = req('GET', f'/api/expert-preregistration/verify?token={t}', headers=extra)
    return st, hd.get('location') or hd.get('Location')

def outcome(loc):
    import base64
    m = re.search(r'[?&]r=([^&.]+)\.', loc or '')
    if not m:
        return None
    s = m.group(1)
    return json.loads(base64.urlsafe_b64decode(s + '=' * (-len(s) % 4)))

for label, t in [('random 64hex', os.urandom(32).hex()), ('malformed', 'abc'), ('empty', ''),
                 ('uppercase of real', tokA.upper()), ('real minus 1 char', tokA[:-1])]:
    st, loc = verify(t)
    log(f'verify {label:18} -> {st} {outcome(loc)}')
st, loc = verify(tokA, {'host': 'evil.attacker.test', 'x-forwarded-host': 'evil.attacker.test'})
log('verify real (Host evil) ->', st, 'location host:', re.sub(r'\?.*', '', loc or ''), outcome(loc))
st, loc = verify(tokA)
log('verify replay ->', st, outcome(loc), '| db verified count:', sql("select status, \"founderNumber\" from \"ExpertPreRegistration\" where email='a1@fo21.test'"))

# second record, then other-record token
req('POST', '/api/expert-preregistration', body('b1@fo21.test'), headers=ip())
tokB, _ = token_for('b1@fo21.test')
st, loc = verify(tokB)
log('verify b1 with its token ->', outcome(loc), sql("select email,status,\"founderNumber\" from \"ExpertPreRegistration\" where email in ('a1@fo21.test','b1@fo21.test') order by email"))

# expired
req('POST', '/api/expert-preregistration', body('c1@fo21.test'), headers=ip())
tokC, _ = token_for('c1@fo21.test')
sql("update \"ExpertPreRegistration\" set \"verifyTokenExpiresAt\" = now() - interval '1 second' where email='c1@fo21.test'")
st, loc = verify(tokC)
log('verify expired c1 ->', outcome(loc), sql("select status from \"ExpertPreRegistration\" where email='c1@fo21.test'"))

# reissue: old link dies
req('POST', '/api/expert-preregistration', body('d1@fo21.test'), headers=ip())
tokD1, _ = token_for('d1@fo21.test')
st, _, tx = req('POST', '/api/expert-preregistration', body('d1@fo21.test'), headers=ip())
log('re-register d1 inside cooldown ->', st, tx)
sql("update \"ExpertPreRegistration\" set \"lastSubmittedAt\" = now() - interval '10 minutes' where email='d1@fo21.test'")
st, _, tx = req('POST', '/api/expert-preregistration', body('d1@fo21.test', fullName='Degisik Ad'), headers=ip())
log('re-register d1 after cooldown ->', st, tx, '| fullName kept:', sql("select \"fullName\" from \"ExpertPreRegistration\" where email='d1@fo21.test'"))
st, loc = verify(tokD1)
log('verify OLD d1 link after reissue ->', outcome(loc))
st, _, tx = req('POST', '/api/expert-preregistration', body('a1@fo21.test'), headers=ip())
log('register verified a1 again (enumeration) ->', st, tx)
st, _, tx = req('POST', '/api/expert-preregistration', body('nobody@fo21.test'), headers=ip())
log('register new address ->', st, tx)

open(f'{S}/probe-out-1.txt', 'w').write('\n'.join(OUT))
