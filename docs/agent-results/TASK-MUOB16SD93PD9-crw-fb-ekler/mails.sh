#!/bin/bash
curl -s "http://127.0.0.1:18102/api/v1/messages?limit=500" | python3 -c 'import json,sys,collections; d=json.load(sys.stdin); c=collections.Counter(t["Address"] for m in d["messages"] for t in m["To"]); print("total=%d"%d["total"], dict(sorted(c.items())))'
