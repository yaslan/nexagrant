#!/bin/bash
# usage: bench.sh <tag> <worktree> ; prints duration of the 300-table test from JSON
SP=/private/tmp/claude-501/-Users-macbook-alan/92adecdd-3e75-4257-a31a-0b1d5e8ffe8c/scratchpad
cd "$2" && npx vitest run src/lib/agency/report.test.ts --reporter=json --outputFile="$SP/prof/$1.json" >/dev/null 2>&1
node -e "const j=require('$SP/prof/$1.json');for(const f of j.testResults)for(const a of f.assertionResults)if(a.title.includes('300'))console.log('$1',a.status,Math.round(a.duration),'ms')"
