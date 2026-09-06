import re
import os

def fix_file(filepath, replacements):
    if not os.path.exists(filepath): return
    with open(filepath, 'r') as f: content = f.read()
    for old, new in replacements:
        content = content.replace(old, new)
    with open(filepath, 'w') as f: f.write(content)

fix_file("src/app/api/concept-notes/[id]/export/route.ts", [
    ("import HTMLtoDOCX from 'html-to-docx';", "// @ts-ignore\nimport HTMLtoDOCX from 'html-to-docx';")
])

fix_file("src/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/page.tsx", [
    ("(s) =>", "(s: any) =>"),
    ("(c) =>", "(c: any) =>"),
    ("(o) =>", "(o: any) =>")
])

fix_file("src/app/[locale]/(app)/[workspace]/relationships/page.tsx", [
    ("(rel) =>", "(rel: any) =>")
])

fix_file("src/app/[locale]/(app)/[workspace]/relationships/actions.ts", [
    ("await tx(prisma as any)", "await (tx as any)(prisma as any)")
])

fix_file("src/lib/inngest/functions.ts", [
    ("async ({ event, step }) => {", "async ({ event, step }: any) => {")
])

fix_file("src/lib/scoring/consortium.ts", [
    ("(s) =>", "(s: any) =>"),
    ("(o) =>", "(o: any) =>"),
    ("(r) =>", "(r: any) =>"),
    ("(p) =>", "(p: any) =>"),
    ("(org) =>", "(org: any) =>"),
    ("(a, b)", "(a: any, b: any)"),
    ("(c, i)", "(c: any, i: any)")
])

