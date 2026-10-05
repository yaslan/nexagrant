#!/bin/bash
# per-user mail count for u69-* recipients from mailpit
curl -s "http://127.0.0.1:18069/api/v1/messages?limit=500" | python3 -c '
import json,sys,collections
d=json.load(sys.stdin); c=collections.Counter()
for m in d["messages"]:
  for t in m["To"]:
    if t["Address"].startswith("u69-"): c[t["Address"].split("@")[0]]+=1
print("total", d["total"], dict(sorted(c.items())) if len(c)<12 else ("users", len(c), "max", max(c.values()), "hist", dict(collections.Counter(c.values()))))
s5=[k for k in c if k.startswith("u69-s5")]
if s5: print("s5 users mailed", len(s5), "max per user", max(c[k] for k in s5))
'
