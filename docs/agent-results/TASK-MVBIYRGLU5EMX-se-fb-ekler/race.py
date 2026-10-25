"""FO-21 item 3: N pending rows, N parallel verify clicks (+ duplicate clicks), then count numbers."""
import concurrent.futures as cf, hashlib, os, subprocess, sys, urllib.request, urllib.error, collections, time

SU = 'postgresql://fabrika:fo21pw@127.0.0.1:55421/fo21'
N = int(sys.argv[1]) if len(sys.argv) > 1 else 110


def sql(q):
    p = subprocess.run(['psql', SU, '-XAt', '-v', 'ON_ERROR_STOP=1', '-c', q], capture_output=True, text=True)
    if p.returncode:
        raise SystemExit(p.stderr)
    return p.stdout.strip()


sql('delete from "ExpertPreRegistration"; delete from "ExpertPreRegAttempt"')
tokens = [os.urandom(32).hex() for _ in range(N)]
values = ','.join(
    f"('race{i}','Race {i}','race{i}@fo21.test','06','Dr','Org',false,now(),now(),'kvkk-v1','{hashlib.sha256(t.encode()).hexdigest()}',now()+interval '1 day','pending','tr')"
    for i, t in enumerate(tokens))
sql('insert into "ExpertPreRegistration"(id,"fullName",email,province,title,organization,"isFreelancer","kvkkAcceptedAt","visibilityConsentAt","consentTextVersion","verifyTokenHash","verifyTokenExpiresAt",status,locale) values ' + values)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


opener = urllib.request.build_opener(NoRedirect)


def click(t):
    try:
        return opener.open(f'http://localhost:3121/api/expert-preregistration/verify?token={t}', timeout=120).status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception as e:
        return type(e).__name__


# every token twice, shuffled: a double click must not take a second number
jobs = tokens + tokens
import random
random.seed(21)
random.shuffle(jobs)
t0 = time.time()
with cf.ThreadPoolExecutor(max_workers=64) as ex:
    codes = collections.Counter(ex.map(click, jobs))
print(f'N={N} clicks={len(jobs)} workers=64 seconds={time.time()-t0:.1f} http={dict(codes)}')
print('verified rows      :', sql('select count(*) from "ExpertPreRegistration" where status=\'verified\''))
print('numbered rows      :', sql('select count("founderNumber") from "ExpertPreRegistration"'))
print('distinct numbers   :', sql('select count(distinct "founderNumber") from "ExpertPreRegistration"'))
print('min/max number     :', sql('select min("founderNumber"), max("founderNumber") from "ExpertPreRegistration"'))
print('gaps 1..100        :', sql('select count(*) from generate_series(1,100) g where g not in (select "founderNumber" from "ExpertPreRegistration" where "founderNumber" is not null)'))
print('verified w/o number:', sql('select count(*) from "ExpertPreRegistration" where status=\'verified\' and "founderNumber" is null'))
print('unique index       :', sql("select indexdef from pg_indexes where tablename='ExpertPreRegistration' and indexdef ilike '%founderNumber%'"))
