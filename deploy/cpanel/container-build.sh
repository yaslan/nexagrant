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
node_modules/.bin/prisma generate
# R2_PUBLIC_HOST comes in with `docker run -e` (build-package.sh); next.config
# turns it into the blog-image remotePattern while it loads.
NODE_ENV=production DEMO_LOGIN_ENABLED=false NEXT_PUBLIC_APP_URL=https://fonbridge.com pnpm build
echo BUILD_OK
{ set +x; } 2>/dev/null
echo "R2_PUBLIC_HOST_AT_BUILD=${R2_PUBLIC_HOST:-}"
# The pattern must be in the config the standalone server starts with.
node -e 'const c=require("/app/.next/required-server-files.json").config.images.remotePatterns, v=(process.env.R2_PUBLIC_HOST||"").trim();
  const h=v?new URL(v).hostname:null, hit=c.filter(p=>p.hostname===h);
  console.log("remotePatterns:", JSON.stringify(c.map(p=>p.hostname+(p.pathname||""))));
  if (h && hit.length!==1) { console.error("R2_PUBLIC_HOST pattern missing from the build"); process.exit(1); }'
set -x
# Scheduled-job worker as one CJS file; @prisma/client resolves from the standalone node_modules.
node_modules/esbuild/bin/esbuild scripts/jobs-worker.ts --bundle --platform=node --target=node22 --format=cjs \
  --outfile=/app/worker-out/jobs-worker.cjs --tsconfig=tsconfig.json \
  --external:@prisma/client --external:.prisma/client --external:pg-native --external:sharp --log-level=warning
echo WORKER_OK
LINKS=$(find .next/standalone -type l | wc -l); echo "symlinks: $LINKS"
find .next/standalone/.next/node_modules -maxdepth 1 -type l -printf '%f -> %l\n' 2>/dev/null || true
tar -C /app -cf /out/build-out.tar .next/standalone .next/static public certs worker-out
echo TAR_OK
