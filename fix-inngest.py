import re

with open("src/lib/inngest/functions.ts", "r") as f:
    content = f.read()

# Replace: { id: '...' }, \n  { cron: '...' } with { id: '...', cron: '...' }
pattern = re.compile(r"(\{\s*id:\s*'[^']+'\s*\}),\s*\{\s*cron:\s*'([^']+)'\s*\}")
def repl(match):
    return match.group(1).replace("}", f", cron: '{match.group(2)}' }}")

new_content = pattern.sub(repl, content)

with open("src/lib/inngest/functions.ts", "w") as f:
    f.write(new_content)
