# İNCELEME-90: createOpportunity girdi saldırı bataryası (restr: yalnız ws-b). curl yerine urllib; gövde ham JSON.
import json, sys, urllib.request
S = sys.argv[1]; B = 'http://localhost:3590'
AID = sys.argv[2]
ck = json.load(open(S + '/cookies.json'))
def call(user, args_raw, page='/tr/ws-b/cagrilar/HORIZON-CL2-2026-D1-01'):
    req = urllib.request.Request(B + page, data=args_raw.encode('utf-8', 'surrogatepass'), method='POST', headers={
        'Next-Action': AID, 'Origin': B, 'Content-Type': 'text/plain;charset=UTF-8', 'Accept': 'text/x-component',
        'Cookie': 'authjs.session-token=' + ck[user]})
    try:
        with urllib.request.urlopen(req, timeout=60) as r: body = r.read().decode('utf-8', 'replace'); code = r.status
    except urllib.error.HTTPError as e: body = e.read().decode('utf-8', 'replace'); code = e.code
    line = next((l for l in body.split('\n') if 'success' in l), body[:160].replace('\n', ' '))
    if '"success":true' in line:
        try: o = json.loads(line.split(':', 1)[1]); line = 'success:true id=%s ws=%s' % (o['opportunity']['id'], o['opportunity']['workspaceId'])
        except Exception: pass
    return code, line[:170]
J = json.dumps
def base(n, **kw):
    a = {'workspaceSlug': 'ws-b', 'title': 'CSFB90-%d' % n, 'topicId': 'HORIZON-CL2-2026-D1-01'}
    a.update(kw); return a
cases = [
 # Y-1 özgün girdiler
 ('Y1 NUL ws-a\\0',            J([base(1, workspaceSlug='ws-a\u0000')])),
 ('Y1 nesne {foo:1}',          J([base(2, workspaceSlug={'foo': 1})])),
 ('Y1 nesne {contains:ws}',    J([base(3, workspaceSlug={'contains': 'ws'})])),
 ('Y1 dizi ["ws-a"]',          J([base(4, workspaceSlug=['ws-a'])])),
 ('Y1 sayı 7',                 J([base(5, workspaceSlug=7)])),
 # uzunluk
 ('uzun 63 (dilbilgisine uyar, yok)', J([base(6, workspaceSlug='a' * 63)])),
 ('uzun 64',                   J([base(7, workspaceSlug='a' * 64)])),
 ('uzun 200k',                 J([base(8, workspaceSlug='a-' * 100000 + 'a')])),
 ('başlık 500',                J([base(9, title='CSFB90-9 ' + 'x' * 491)])),
 ('başlık 501',                J([base(10, title='CSFB90-10' + 'x' * 492)])),
 ('notlar 10001',              J([base(11, notes='n' * 10001)])),
 ('gövde ~3MB başlık',         J([base(12, title='CSFB90-12' + 'x' * 3_000_000)])),
 # Unicode eşdeğerleri
 ('tam genişlik ｗｓ-ｂ',        J([base(13, workspaceSlug='ｗｓ-ｂ')])),
 ('U+2010 tire ws‐b',          J([base(14, workspaceSlug='ws‐b')])),
 ('Kelvin \\u212A → k?',       J([base(15, workspaceSlug='Kalite')])),
 ('birleşik ws-b\\u0301',       J([base(16, workspaceSlug='ws-b́')])),
 ('büyük WS-B',                J([base(17, workspaceSlug='WS-B')])),
 ('Türkçe İ: WS-B ile dotless', J([base(18, workspaceSlug='ws-ı')])),
 ('sonda \\n ws-b\\n',          J([base(19, workspaceSlug='ws-b\n')])),
 ('boşluklu " ws-b"',          J([base(20, workspaceSlug=' ws-b')])),
 # prototip anahtarları
 ('slug "__proto__"',          J([base(21, workspaceSlug='__proto__')])),
 ('slug "constructor"',        J([base(22, workspaceSlug='constructor')])),
 ('slug "tostring"',           J([base(23, workspaceSlug='tostring')])),
 ('gövde __proto__:{slug ws-a}, slug yok', '[{"__proto__":{"workspaceSlug":"ws-a"},"title":"CSFB90-24"}]'),
 ('gövde constructor.prototype',  '[{"constructor":{"prototype":{"workspaceSlug":"ws-a"}},"title":"CSFB90-25"}]'),
 ('gövde __proto__ + slug ws-b', '[{"__proto__":{"isAdmin":true,"tenantId":"o83-t8"},"workspaceSlug":"ws-b","title":"CSFB90-26"}]'),
 # boş / eksik / Flight kodlamaları
 ('slug ""',                   J([base(27, workspaceSlug='')])),
 ('slug yok',                  '[{"title":"CSFB90-28"}]'),
 ('slug null',                 J([base(29, workspaceSlug=None)])),
 ('argüman yok []',            '[]'),
 ('argüman null',              '[null]'),
 ('slug "$undefined"',         J([base(32, workspaceSlug='$undefined')])),
 ('slug "$D2026-01-01"',       J([base(33, workspaceSlug='$D2026-01-01')])),
 ('slug "$n7"',                J([base(34, workspaceSlug='$n7')])),
 ('slug "$@0" (promise ref)',  J([base(35, workspaceSlug='$@0')])),
 ('slug "$$ws-b"',             J([base(36, workspaceSlug='$$ws-b')])),
 ('başlık ""',                 J([base(37, title='')])),
 ('başlık "   "',              J([base(38, title='   ')])),
 ('başlık NUL',                J([base(39, title='CSFB90-39\u0000')])),
 ('başlık ANSI \\x1b',          J([base(40, title='CSFB90-40\u001b[31m')])),
 ('başlık yalnız vekil \\ud800', '[{"workspaceSlug":"ws-b","title":"CSFB90-41 \\ud800 lone"}]'),
 ('başlık RLO \\u202e',         J([base(42, title='CSFB90-42 ‮gnp.exe')])),
 ('stage "G9"',                J([base(43, stage='G9')])),
 ('ek alan tenantId/workspaceId', J([base(44, tenantId='o83-t8', workspaceId='o83-ws-a')])),
 # meşru kontrol
 ('meşru ws-b',                J([base(45)])),
 ('ws-a (üyelik dışı)',        J([base(46, workspaceSlug='ws-a')])),
]
only = set(int(x) for x in sys.argv[3].split(',')) if len(sys.argv) > 3 else None
for i, (label, raw) in enumerate(cases, 1):
    if only and i not in only: continue
    code, line = call('restr', raw)
    print('%2d %-38s | %d | %s' % (i, label, code, line), flush=True)
