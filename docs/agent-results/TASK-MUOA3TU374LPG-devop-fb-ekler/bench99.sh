#!/bin/bash
# usage: bench99.sh <tag> <worktree>  → 300-table test duration (vitest JSON)
SP=/private/tmp/claude-501/-Users-macbook-alan/58cb1985-b0ed-42d2-8bc9-096ab7fe3fae/scratchpad
L=$(uptime | sed 's/.*averages: //' | cut -d' ' -f1)
cd "$2" && npx vitest run src/lib/agency/report.test.ts -t '300 random' --reporter=json --outputFile="$SP/prof/$1.json" >/dev/null 2>&1
node -e "const j=require('$SP/prof/$1.json');for(const f of j.testResults)for(const a of f.assertionResults)if(a.title.includes('300'))console.log('$1',a.status,Math.round(a.duration),'ms','load=$L')"
