#!/usr/bin/env bash
# Pull a digest-pinned image with a bounded retry (NG-348).
#
# CI's `docker run` of cgr.dev/chainguard/minio failed in two of three runs with
# "unexpected status" (exit 125) before any test ran: a registry hiccup, not a
# code problem. This pulls first, retrying with a growing wait, so `docker run`
# afterwards finds the image locally.
#
# Usage: scripts/ci/docker-pull-retry.sh <label> <image@sha256:digest>
#   label  shown in the error, e.g. "MinIO"
#   PULL_ATTEMPTS (default 3) and PULL_BACKOFF_SECONDS (default 10) tune it;
#   the wait before attempt n+1 is n * PULL_BACKOFF_SECONDS (10 s, 20 s, ...).
#
# Only digest-pinned refs are accepted: a tag could move between attempts and
# a retry must never pull a different image than the one the workflow names.
set -euo pipefail

label="${1:?usage: docker-pull-retry.sh <label> <image@sha256:digest>}"
ref="${2:?usage: docker-pull-retry.sh <label> <image@sha256:digest>}"
attempts="${PULL_ATTEMPTS:-3}"
backoff="${PULL_BACKOFF_SECONDS:-10}"

if ! [[ "$ref" =~ @sha256:[0-9a-f]{64}$ ]]; then
  echo "::error::$label image ref is not pinned by sha256 digest: $ref"
  exit 2
fi
if ! [[ "$attempts" =~ ^[1-9][0-9]*$ && "$backoff" =~ ^[0-9]+$ ]]; then
  echo "::error::PULL_ATTEMPTS must be >= 1 and PULL_BACKOFF_SECONDS >= 0"
  exit 2
fi

for ((n = 1; n <= attempts; n++)); do
  echo "$label: docker pull attempt $n/$attempts: $ref"
  if docker pull "$ref"; then
    echo "$label: image pulled on attempt $n/$attempts"
    exit 0
  fi
  if ((n < attempts)); then
    wait_s=$((n * backoff))
    echo "$label: pull attempt $n failed; retrying in ${wait_s}s"
    sleep "$wait_s"
  fi
done

# Turkish, as the task asks; the workflow annotation shows it on the run page.
echo "::error title=$label image pull failed (infrastructure)::$label imajı $attempts denemede çekilemedi (altyapı): $ref"
exit 1
