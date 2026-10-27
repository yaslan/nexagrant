#!/bin/bash
set -euxo pipefail
uname -m; node -v; ldd --version > /tmp/ldd.txt; sed -n 1p /tmp/ldd.txt
rm -rf /app; mkdir -p /app && tar -x -C /app -f /out/src.tar && cd /app
corepack enable
export NEXT_TELEMETRY_DISABLED=1 CI=1
# Flat node_modules: no symlinks in the standalone tree (zip/File Manager safe).
# pnpm 11 ignores --config.node-linker; the workspace file is where it reads it.
printf '\nnodeLinker: hoisted\n' >> pnpm-workspace.yaml
pnpm install --frozen-lockfile
test ! -L node_modules/next || { echo "node_modules is not flat (node-linker)"; exit 1; }
# Privacy publish gate (FO-180): the commit being packaged must carry no
# placeholder or demo value in /privacy. Run on the archived sources, before the
# build, so a red check costs one install, not a build. Never part of `pnpm gate`.
pnpm privacy:publish-check
node_modules/.bin/vitest run tests/privacy-notice.test.ts
echo PRIVACY_OK
node_modules/.bin/prisma generate
# R2_PUBLIC_HOST comes from build-package.sh (docker -e); next.config freezes it.
NODE_ENV=production DEMO_LOGIN_ENABLED=false NEXT_PUBLIC_APP_URL=https://fonbridge.com R2_PUBLIC_HOST="${R2_PUBLIC_HOST:-}" pnpm build
echo BUILD_OK
# Scheduled-job worker as one CJS file; @prisma/client resolves from the standalone node_modules.
node_modules/esbuild/bin/esbuild scripts/jobs-worker.ts --bundle --platform=node --target=node22 --format=cjs \
  --outfile=/app/worker-out/jobs-worker.cjs --tsconfig=tsconfig.json \
  --external:@prisma/client --external:.prisma/client --external:pg-native --external:sharp --log-level=warning
echo WORKER_OK
LINKS=$(find .next/standalone -type l | wc -l); echo "symlinks: $LINKS"
tar -C /app -cf /out/build-out.tar .next/standalone .next/static public certs worker-out
echo TAR_OK
