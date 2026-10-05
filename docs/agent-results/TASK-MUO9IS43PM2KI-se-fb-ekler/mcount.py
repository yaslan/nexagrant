import json,urllib.request,collections,sys
d=json.load(urllib.request.urlopen('http://127.0.0.1:18095/api/v1/messages?limit=5000'))
c=collections.Counter(t['Address'].split('@')[0] for m in d['messages'] for t in m['To'])
pre=sys.argv[1] if len(sys.argv)>1 else ''
print('total',d['total'],dict(sorted((k,v) for k,v in c.items() if k.startswith(pre))))
