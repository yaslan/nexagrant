import subprocess, statistics, sys
paths = ["/logo.png","/favicon.ico","/_next/static/chunks/0cz1d0mv5g_q7.js","/_next/image?url=%2Flogo.png&w=64&q=75","/yok.png","/Logo.png","/_next/Image","/tr/login"]
N=int(sys.argv[1])
res={(P,p):[] for P in (3105,3104) for p in paths}
for i in range(N):
    for p in paths:
        for P in ((3105,3104) if i%2==0 else (3104,3105)):
            t=subprocess.run(["curl","-s","-o","/dev/null","-w","%{time_starttransfer}",f"http://127.0.0.1:{P}{p}"],capture_output=True,text=True).stdout
            res[(P,p)].append(float(t)*1000)
def q(v,f): v=sorted(v); return v[min(len(v)-1,int(f*len(v)))]
print(f"{'path':42} {'taban med/p95 ms':>18} {'yeni med/p95 ms':>18}")
for p in paths:
    b=res[(3105,p)]; y=res[(3104,p)]
    print(f"{p:42} {statistics.median(b):8.2f}/{q(b,.95):7.2f}  {statistics.median(y):8.2f}/{q(y,.95):7.2f}")
