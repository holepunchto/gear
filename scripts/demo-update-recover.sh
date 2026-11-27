#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="$(node -p 'process.platform + "-" + process.arch')"
APP="$ROOT/out/make/$HOST/Gear.app"
EXE="$APP/Contents/MacOS/Gear"
LOG="$ROOT/out/$HOST/recover.log"
FAILED='applying update failed'
FIX_DELAY=7

STAGE="${1:-all}"

say() { printf '\n\033[1;32m━━ %s\033[0m\n' "$*"; }
note() { printf '   %s\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

usage() {
  cat <<'TEXT'
Drives the recovery path: a release that cannot build, then a fix published
behind it, so the Retry button can be watched finding the fix instead of
rebuilding the failure.

  scripts/demo-update-recover.sh            publish the broken release, build, launch,
                                            publish the fix once the build fails
  scripts/demo-update-recover.sh plan       print what it would do, change nothing
  scripts/demo-update-recover.sh break      publish the broken release only
  scripts/demo-update-recover.sh fix        publish the fix only — safe while the app runs
  scripts/demo-update-recover.sh build      build the local app only
  scripts/demo-update-recover.sh run        launch what is already built

The broken release is this working tree with package.json#scripts.build replaced
by a command that exits 1, published as the next patch version. The fix is the
same tree unpatched, one patch version above it. Both are tagged on the remote
only; the local working tree is put back afterwards, uncommitted.

Publishing the fix while Gear is running works because the app's embedded gip
serves helper sessions, so the push attaches to the store it already holds
instead of fighting it for the lock.

Demo scaffolding, for the pear-deployment branch. It commits the working tree
and pushes to a real gip remote, so it is not for a branch whose history
matters.
TEXT
}

case "$STAGE" in
  help | -h | --help)
    usage
    exit 0
    ;;
  all | plan | break | fix | build | run) ;;
  *)
    usage
    die "unknown stage: $STAGE"
    ;;
esac

command -v gip >/dev/null || die "gip not on PATH — install gip-transport's binaries"
command -v 'git-remote-git+pear' >/dev/null ||
  die "git-remote-git+pear not on PATH — git cannot speak git+pear:// without it"

case "$HOST" in
  darwin-*) ;;
  *) die "this demo script only drives the macOS build, not $HOST" ;;
esac

gip_remote() {
  git -C "$1" remote -v | awk '$3 == "(push)" && $2 ~ /^git\+pear:\/\// { print $1; exit }'
}

REMOTE="$(gip_remote "$ROOT")"
[ -n "$REMOTE" ] || die "no git+pear:// remote on this repo"

APP_VERSION="$(node -p "require('$ROOT/package.json').version")"
UPGRADE="$(node -p "require('$ROOT/package.json').upgrade")"
BAD_MARK='deliberately unbuildable'
BAD_BUILD="node -e \"console.error('demo: this release is $BAD_MARK'); process.exit(1)\""
SANE_BUILD='vite build'
GOOD_BUILD="$(node -p "require('$ROOT/package.json').scripts.build")"

case "$GOOD_BUILD" in
  *"$BAD_MARK"*)
    GOOD_BUILD="$SANE_BUILD"
    say "package.json#scripts.build was left patched by an earlier run"
    note "restoring it to '$SANE_BUILD' — the broken command is never carried forward"
    node -e "
      const fs = require('fs');
      const file = '$ROOT/package.json';
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
      pkg.scripts.build = process.argv[1];
      fs.writeFileSync(file, JSON.stringify(pkg, null, '\t') + '\n');
    " "$SANE_BUILD"
    ;;
esac

if [ "$STAGE" != fix ] && [ "$STAGE" != plan ] && pgrep -f "$EXE" >/dev/null 2>&1; then
  say "stopping the running Gear"
  pkill -f "$EXE" || true
  sleep 1
fi

REMOTE_TAGS="$(
  git -C "$ROOT" ls-remote --tags "$REMOTE" 2>/dev/null |
    awk '$2 ~ /^refs\/tags\/v[0-9]+\.[0-9]+\.[0-9]+$/ { sub(/^refs\/tags\/v/, "", $2); print $2 }' ||
    true
)"
LOCAL_TAGS="$(git -C "$ROOT" tag --list 'v[0-9]*' | sed 's/^v//' || true)"

bump() {
  printf '%s\n%s\n%s\n%s\n' "$REMOTE_TAGS" "$LOCAL_TAGS" "$APP_VERSION" "${1:-}" | node -e "
    const seen = require('fs').readFileSync(0, 'utf8').split('\n')
      .map((v) => v.trim()).filter((v) => /^\d+\.\d+\.\d+\$/.test(v))
      .map((v) => v.split('.').map(Number));
    const [a, b, c] = seen.concat([[0, 0, 0]])
      .sort((x, y) => y[0] - x[0] || y[1] - x[1] || y[2] - x[2])[0];
    console.log([a, b, c + 1].join('.'));
  "
}

BROKEN_VERSION="$(bump)"
FIXED_VERSION="$(bump "$BROKEN_VERSION")"

say "plan"
note "host             $HOST"
note "app version      $APP_VERSION   (what gets built and launched)"
note "broken release   $BROKEN_VERSION   (offered first — its build exits 1)"
note "fixed release    $FIXED_VERSION   (published once that build has failed)"
note "upgrade link     $UPGRADE"
note "remote           $REMOTE"

[ "$STAGE" = plan ] && exit 0

set_build() {
  node -e "
    const fs = require('fs');
    const file = '$ROOT/package.json';
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    pkg.scripts.build = process.argv[1];
    fs.writeFileSync(file, JSON.stringify(pkg, null, '\t') + '\n');
  " "$1"
}

publish() {
  local version="$1" broken="$2" label=""

  [ "$broken" = yes ] && label=" (unbuildable)"

  cd "$ROOT"

  if [ -n "$(git status --porcelain)" ]; then
    git add -A
    git commit -qm "demo: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    note "committed local changes"
  fi

  if [ "$broken" = no ]; then
    case "$(node -p "require('$ROOT/package.json').scripts.build")" in
      *"$BAD_MARK"*) die "refusing to publish a fix whose build script is still patched" ;;
    esac
  fi

  npm --silent version "$version" --no-git-tag-version >/dev/null

  if [ "$broken" = yes ]; then
    trap 'set_build "$GOOD_BUILD"' INT TERM
    set_build "$BAD_BUILD"
  fi

  git diff --quiet || git commit -qam "$version$label"

  git push -q --force "$REMOTE" "HEAD:refs/heads/main" "HEAD:refs/tags/v$version"
  note "pushed v$version (remote tag only)"

  if [ "$broken" = yes ]; then
    set_build "$GOOD_BUILD"
    trap - INT TERM
  fi
  npm --silent version "$APP_VERSION" --no-git-tag-version >/dev/null
  note "working tree back to $APP_VERSION (uncommitted)"
}

if [ "$STAGE" = fix ]; then
  say "publishing the fix, gear-demo $FIXED_VERSION"
  publish "$FIXED_VERSION" no
  say "done — press Retry update in the app"
  exit 0
fi

if [ "$STAGE" = all ] || [ "$STAGE" = break ]; then
  say "publishing the broken release, gear-demo $BROKEN_VERSION"
  publish "$BROKEN_VERSION" yes
fi

if [ "$STAGE" = all ] || [ "$STAGE" = build ]; then
  say "building Gear $APP_VERSION for $HOST"
  cd "$ROOT"
  npm run make -- --host "$HOST"
  [ -d "$APP" ] || die "expected $APP"
fi

case "$STAGE" in
  break | build)
    say "done — $STAGE only"
    note "launch it with: scripts/demo-update-recover.sh run"
    exit 0
    ;;
esac

[ -x "$EXE" ] || die "no built app at $EXE — run: scripts/demo-update-recover.sh build"

BUILT_VERSION="$(defaults read "$APP/Contents/Info" CFBundleShortVersionString 2>/dev/null ||
  echo "$APP_VERSION")"

say "launching Gear $BUILT_VERSION"

mkdir -p "$(dirname "$LOG")"
: >"$LOG"
"$EXE" >"$LOG" 2>&1 &
APP_PID=$!
trap 'kill "$APP_PID" 2>/dev/null || true' INT TERM EXIT

URL=""
for _ in $(seq 1 150); do
  kill -0 "$APP_PID" 2>/dev/null || break
  found="$(sed -n 's|.*Listening on http://[^:]*:\([0-9][0-9]*\).*|\1|p' "$LOG" | head -1)"
  if [ -n "$found" ]; then URL="http://localhost:$found/settings"; break; fi
  sleep 0.2
done

if [ -z "$URL" ]; then
  cat "$LOG"
  die "the app never reported a listening port"
fi

say "open $URL"
note ""
note "What to expect on that page:"
note "  1. 'Version $BROKEN_VERSION is available' with an Install update button."
note "  2. Click it. Cloning the release → Installing dependencies → Building the"
note "     app, where it stops: 'demo: this release is deliberately unbuildable'"
note "     and 'Update failed: npm run make exited with code 1'."
note "  3. This script sees that failure, waits ${FIX_DELAY}s, and publishes v$FIXED_VERSION behind it."
note "  4. Click Retry update. The button reads 'Checking…' while it resolves the"
note "     newest tag, then builds $FIXED_VERSION rather than the release that failed."
note "  5. 'Version $FIXED_VERSION installed', with the button now a Restart."
note ""
note "Retrying before step 3 lands rebuilds $BROKEN_VERSION and fails again, which is"
note "also correct — there is nothing newer to find yet."
note ""
note "App log below (also at $LOG)."
note "Ctrl-C closes the app."
printf '\n'

(
  while kill -0 "$APP_PID" 2>/dev/null; do
    if grep -q "$FAILED" "$LOG" 2>/dev/null; then
      say "the build failed — publishing the fix in ${FIX_DELAY}s, gear-demo $FIXED_VERSION"
      sleep "$FIX_DELAY"
      publish "$FIXED_VERSION" no
      say "press Retry update in the app"
      exit 0
    fi
    sleep 1
  done
) &
WATCH_PID=$!

tail -n +1 -f "$LOG" &
TAIL_PID=$!
wait "$APP_PID" || true
kill "$TAIL_PID" "$WATCH_PID" 2>/dev/null || true
