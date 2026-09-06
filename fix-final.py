import re
import os

filepath = "prisma.config.ts"
if os.path.exists(filepath):
    with open(filepath, 'r') as f: content = f.read()
    content = re.sub(r"earlyAccess:\s*true,?", "", content)
    with open(filepath, 'w') as f: f.write(content)

filepath = "src/app/[locale]/(app)/[workspace]/concept-notes/page.tsx"
if os.path.exists(filepath):
    with open(filepath, 'r') as f: content = f.read()
    content = content.replace("t =>", "(t: any) =>")
    content = content.replace("note =>", "(note: any) =>")
    with open(filepath, 'w') as f: f.write(content)

