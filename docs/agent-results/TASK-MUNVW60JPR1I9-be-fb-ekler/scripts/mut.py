import sys
p='src/lib/relationships/stale-reminder.ts'; s=open(p).read()
M={
'N1':[("       AND (o.prev IS NULL OR o.prev < ${today}::date)\n","")],
'N2':[("""      claim = await claimDigest(userId, now);
    } catch (error) {
      out.digestsFailed++;
      out.errors.push({ scope: 'digest', reason: errorMessage(error) });
      continue;
    }""","""      claim = await claimDigest(userId, now);
    } catch (error) {
      claim = { previous: null };
    }""")],
'N3':[("      claim = await claimDigest(userId, now);","      claim = { previous: null };")],
'N4':[("""  if (!isPresentId(userId)) return;
  await prisma.$executeRaw`""","""  if (!isPresentId(userId) || true) return;
  await prisma.$executeRaw`""")],
'N5':[("""  const ids = userIds.filter(isPresentId);""","""  const ids = userIds.filter(isPresentId).slice(0, 0);""")],
'N6':[(""" WHERE id = ${userId} FOR UPDATE) o""",""" WHERE id = ${userId}) o""")],
}
for a,b in M[sys.argv[1]]:
    assert s.count(a)==1,(sys.argv[1],a)
    s=s.replace(a,b)
open(p,'w').write(s)
