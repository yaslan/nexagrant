#!/bin/bash
# Builds the cPanel ("Setup Node.js App") deploy zip for one commit, for Linux x86_64.
#
#   deploy/cpanel/build-package.sh <commit> <out-dir>
#
# Needs Docker (linux/amd64; on Apple silicon through emulation). The build runs
# in node:22-bookworm-slim from `git archive <commit>` — no working-tree file and
# no .env reaches it. Output in <out-dir>: fonbridge-app-<short>.zip, SHA256SUMS.
# The zip unpacks straight into the application root (/home/fonbridge/fonbridge-app):
#   app.js  package.json  worker.sh  BUILD-INFO.txt  certs/  app/ (Next standalone)
# FB_BUILD_DIR=<dir with build-out.tar + build.log> re-packages without building.
# R2_PUBLIC_HOST must be set in the caller's environment (empty = no public
# bucket): next.config reads it at `next build` for images.remotePatterns, so the
# package only shows uploaded blog images from the host it was built with. The
# same value goes into the cPanel environment (ENV-LISTESI.md). It reaches the
# container as `-e R2_PUBLIC_HOST`, never on a command line.
# FB_PNPM_STORE=<dir> keeps the container's pnpm store between runs (a slow
# registry then resumes instead of starting over); the packages are the
# lockfile's either way.
# Idempotent: re-running overwrites the zip and SHA256SUMS. TASK-MUST2PP2NHP6L.
set -euo pipefail

COMMIT="${1:?usage: build-package.sh <commit> <out-dir>}"
OUT="${2:?usage: build-package.sh <commit> <out-dir>}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(git -C "$HERE" rev-parse --show-toplevel)"
SHORT="$(git -C "$REPO" rev-parse --short=8 "$COMMIT")"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
if [ -n "${FB_BUILD_DIR:-}" ]; then
  # Re-package an earlier container build (its build-out.tar + build.log) without rebuilding.
  cp "$FB_BUILD_DIR/build-out.tar" "$FB_BUILD_DIR/build.log" "$WORK/"
else
  : "${R2_PUBLIC_HOST?set R2_PUBLIC_HOST to the public bucket URL, or to empty for none (ENV-LISTESI.md)}"
  export R2_PUBLIC_HOST
  # Same rule as src/lib/env.ts (blank = unset, otherwise a URL) and
  # publicAssetImagePattern (http/https only, or no pattern is built).
  node -e 'const v=process.env.R2_PUBLIC_HOST.trim(); let p=""; try { p=new URL(v).protocol } catch {}
           if (v && p!=="http:" && p!=="https:") { console.error("R2_PUBLIC_HOST is not an http(s) URL"); process.exit(1); }'
  git -C "$REPO" archive --format=tar "$COMMIT" > "$WORK/src.tar"
  cp "$HERE/container-build.sh" "$WORK/build.sh"
  STORE=()
  if [ -n "${FB_PNPM_STORE:-}" ]; then mkdir -p "$FB_PNPM_STORE"; STORE=(-v "$(cd "$FB_PNPM_STORE" && pwd):/root/.local/share/pnpm/store"); fi
  docker run --rm --platform linux/amd64 -e R2_PUBLIC_HOST ${STORE[@]+"${STORE[@]}"} -v "$WORK:/out" node:22-bookworm-slim /out/build.sh 2>&1 | tee "$WORK/build.log"
fi
grep -q 'TAR_OK' "$WORK/build.log"

mkdir "$WORK/b" "$WORK/stage"
tar -xf "$WORK/build-out.tar" -C "$WORK/b"
S="$WORK/stage"
cp -R "$WORK/b/.next/standalone" "$S/app"
cp -R "$WORK/b/.next/static" "$S/app/.next/static"
rm -rf "$S/app/public" && cp -R "$WORK/b/public" "$S/app/public"
cp "$WORK/b/worker-out/jobs-worker.cjs" "$S/app/jobs-worker.cjs"
mkdir "$S/certs" && cp "$WORK/b/certs/"*.crt "$WORK/b/certs/README.md" "$S/certs/"
cp "$HERE/app.js" "$HERE/package.json" "$HERE/worker.sh" "$S/"
chmod 755 "$S/worker.sh"
# Nothing the build may have left that is not for the server.
find "$S" \( -name '.env' -o -name '.env.*' -o -name '*.pem' -o -name '*.key' -o -name '.DS_Store' \) -print -delete
# The only links allowed: Turbopack's aliases for serverExternalPackages under
# app/.next/node_modules (relative, inside the package). app.js restores them
# from this manifest if the extractor loses them.
(cd "$S/app" && find .next/node_modules -type l | sort | while read -r l; do
  printf '{"link":"%s","target":"%s"}\n' "$l" "$(readlink "$l")"; done) \
  | node -e 'const l=require("fs").readFileSync(0,"utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
             for (const x of l) if (x.target.startsWith("/") || !require("path").normalize(require("path").join(x.link,"..",x.target)).startsWith("node_modules/")) { console.error("bad link", x); process.exit(1); }
             process.stdout.write(JSON.stringify(l,null,2)+"\n")' > "$S/app/.next/node_modules-links.json"
OTHER="$(find "$S" -type l -not -path "$S/app/.next/node_modules/*")"
if [ -n "$OTHER" ]; then echo "symlinks outside app/.next/node_modules:"; echo "$OTHER"; exit 1; fi
{
  echo "commit: $(git -C "$REPO" rev-parse "$COMMIT")"
  echo "built: $(date -u +%FT%TZ)"
  echo "platform: linux/amd64 (node:22-bookworm-slim, glibc 2.36), node $(grep -m1 -oE '^v22[.0-9]+' "$WORK/build.log" || echo 22)"
  echo "packaging: deploy/cpanel @ $(git -C "$REPO" rev-parse --short=8 HEAD)"
  # Not a secret (it is in every response's CSP img-src); cPanel must carry the same value.
  echo "R2_PUBLIC_HOST at build: $(grep -m1 -oE '^R2_PUBLIC_HOST_AT_BUILD=.*' "$WORK/build.log" | cut -d= -f2- || true)"
} > "$S/BUILD-INFO.txt"

ZIP="fonbridge-app-$SHORT.zip"
rm -f "$OUT/$ZIP"
(cd "$S" && zip -qry -X "$OUT/$ZIP" .)   # -y: store the links as links
(cd "$OUT" && shasum -a 256 "$ZIP" > SHA256SUMS)
cat "$OUT/SHA256SUMS"
