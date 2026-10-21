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
# Idempotent: re-running overwrites the zip and SHA256SUMS. TASK-MUST2PP2NHP6L.
#
# R2_PUBLIC_HOST (the public bucket's base URL, a public value, not a secret) is
# read by next.config.ts at `next build` time and frozen into the standalone
# server's images.remotePatterns: a zip built without it answers 400 for every
# uploaded blog cover, whatever cPanel says at runtime (TASK-MVCH99A54WALG).
# Give the exact value cPanel will carry, or FB_NO_PUBLIC_ASSETS=1 to build
# without uploaded images on purpose.
set -euo pipefail

if [ -z "${FB_BUILD_DIR:-}" ] && [ -z "${R2_PUBLIC_HOST:-}" ] && [ "${FB_NO_PUBLIC_ASSETS:-}" != 1 ]; then
  echo "R2_PUBLIC_HOST is unset: uploaded blog images would not display (see header). Set it, or FB_NO_PUBLIC_ASSETS=1." >&2
  exit 1
fi

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
  git -C "$REPO" archive --format=tar "$COMMIT" > "$WORK/src.tar"
  cp "$HERE/container-build.sh" "$WORK/build.sh"
  docker run --rm --platform linux/amd64 -e R2_PUBLIC_HOST="${R2_PUBLIC_HOST:-}" -v "$WORK:/out" node:22-bookworm-slim /out/build.sh 2>&1 | tee "$WORK/build.log"
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
  # What the standalone server really froze, read back from the build output.
  echo "images.remotePatterns: $(node -e 'process.stdout.write(JSON.stringify(require(process.argv[1]).config.images.remotePatterns.map((p) => p.protocol + "://" + p.hostname + (p.port ? ":" + p.port : "") + (p.pathname || ""))))' "$S/app/.next/required-server-files.json")"
} > "$S/BUILD-INFO.txt"

ZIP="fonbridge-app-$SHORT.zip"
rm -f "$OUT/$ZIP"
(cd "$S" && zip -qry -X "$OUT/$ZIP" .)   # -y: store the links as links
(cd "$OUT" && shasum -a 256 "$ZIP" > SHA256SUMS)
cat "$OUT/SHA256SUMS"
