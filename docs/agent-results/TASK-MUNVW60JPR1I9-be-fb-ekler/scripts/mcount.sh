#!/bin/bash
curl -s "http://127.0.0.1:18096/api/v1/messages?limit=500" | python3 -c '
import json,sys,collections
d=json.load(sys.stdin); c=collections.Counter()
for m in d["messages"]:
  for t in m["To"]:
    if t["Address"].startswith("u96-"): c[t["Address"].split("@")[0]]+=1
print("total", d["total"], dict(sorted(c.items())))'
