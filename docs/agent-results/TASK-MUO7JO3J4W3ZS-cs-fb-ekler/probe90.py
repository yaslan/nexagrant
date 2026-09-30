# O-1 yönlendirme zinciri (8 hop'a kadar, döngü tespiti)
import json, sys, http.client, urllib.parse
S = sys.argv[1]; ck = json.load(open(S + '/cookies.json'))
T = 'HORIZON-CL2-2026-D1-01'
def chain(user, path):
    seen, hops, cur = set(), [], path
    for _ in range(9):
        c = http.client.HTTPConnection('localhost', 3590, timeout=60)
        h = {'Cookie': 'authjs.session-token=' + ck[user]} if user else {}
        c.request('GET', cur, headers=h); r = c.getresponse(); r.read()
        loc = r.getheader('location'); hops.append(str(r.status))
        if r.status in (301, 302, 303, 307, 308) and loc:
            nxt = urllib.parse.urlsplit(loc); nxt = nxt.path + ('?' + nxt.query if nxt.query else '')
            if nxt in seen: return ' -> '.join(hops) + ' ⚠DÖNGÜ ' + nxt
            seen.add(nxt); hops.append(nxt); cur = nxt
        else: return ' -> '.join(hops)
    return ' -> '.join(hops) + ' ⚠8+ hop'
C = [
 ('t8u', f'/tr/calls/topic/{T}'), ('t8u', f'/en/calls/topic/{T}'),
 ('t8u', f'/tr/default/cagrilar/{T}'), ('t8u', f'/en/default/calls/{T}'),
 ('t8u', f'/tr/%C3%A7al%C4%B1%C5%9Fma%20alan%C4%B1/cagrilar/{T}'),
 ('t8u', f'/tr/%C3%87ALI%C5%9EMA%20ALANI/cagrilar/{T}'),
 ('t9u', f'/tr/calls/topic/{T}'), ('t9u', f'/tr/default/cagrilar/{T}'),
 ('t9u', f'/tr/gecerli/cagrilar/{T}'), ('t9u', f'/tr/Eski_Alan/cagrilar/{T}'), ('t9u', f'/tr/eski_alan/cagrilar/{T}'),
 ('t9u', '/tr/gecerli/firsatlar'),
 ('owner', f'/tr/%E2%84%AAalite/cagrilar/{T}'),   # Kelvin işareti K → kalite
 ('owner', f'/tr/KALITE/cagrilar/{T}'),
 ('owner', f'/tr/%4B%41LITE/cagrilar/{T}'),
 ('owner', f'/tr/kal%C4%B0te/cagrilar/{T}'),      # İ → i̇ (birleşik nokta)
 ('owner', f'/tr/ws-a%00/cagrilar/{T}'),
 ('owner', f'/tr/ws-a%20/cagrilar/{T}'),
 ('owner', f'/tr/{"a"*64}/cagrilar/{T}'),
 ('owner', f'/tr/{"a"*63}/cagrilar/{T}'),
 ('owner', f'/tr/default/cagrilar/{T}'), ('owner', f'/tr/calls/topic/{T}'),
 ('owner', f'/tr/constructor/cagrilar/{T}'), ('owner', f'/tr/__proto__/cagrilar/{T}'),
 ('restr', f'/tr/WS-B/cagrilar/{T}'), ('restr', f'/tr/ws-a/cagrilar/{T}'), ('restr', f'/tr/default/cagrilar/{T}'),
 ('t7u', f'/tr/default/cagrilar/{T}'), ('del', f'/tr/default/cagrilar/{T}'),
 ('none', f'/tr/calls/topic/{T}'), ('none', f'/tr/default/cagrilar/{T}'),
 (None, f'/tr/%C3%A7al%C4%B1%C5%9Fma%20alan%C4%B1/cagrilar/{T}'),
 ('owner', f'/tr/%E0%A4%A/cagrilar/{T}'),
]
for u, p in C: print(f'{u or "oturumsuz":6} {p[:70]:70} : {chain(u, p)}', flush=True)
