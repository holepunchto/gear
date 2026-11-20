#!/usr/bin/env bash
#
# Run the whole source-install update flow on this machine so it can be watched
# in the UI.
#
#   scripts/demo-update.sh              # publish, build, launch
#   scripts/demo-update.sh plan         # print what it would do, change nothing
#   scripts/demo-update.sh publish      # just push the new release
#   scripts/demo-update.sh build        # just build the local app
#   scripts/demo-update.sh run          # just launch what is already built
#
# What it sets up:
#
#   1. pear-repo-updater is pushed to its git+pear remote, because that is where
#      the app installs it from — local edits to it are invisible until pushed.
#   2. Gear's working tree is pushed to gear-demo as the NEXT patch version,
#      tagged, in a single push. The tag has to be the last thing on that log:
#      the updater resolves a tag to the log length it was pushed at and clones
#      that checkout, so anything pushed afterwards would not be in the build.
#   3. The local app is built at its CURRENT version, which is older than the
#      tag just pushed. That difference is the whole update.
#
# Then it launches the app and waits. Nothing builds until the button is
# clicked — that click is what starts the rebuild, which is the point of
# watching it.
#
# Demo scaffolding, for the pear-deployment branch. It pushes to real gip
# remotes and rewrites package.json's version, so it is not something to run on
# a branch whose history matters.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPDATER="$(cd "$ROOT/../pear-repo-updater" && pwd)"
PEAR_INSTALL="$(cd "$ROOT/../pear-install" && pwd)"
HOST="$(node -p 'process.platform + "-" + process.arch')"
APP="$ROOT/out/$HOST/Gear.app"
EXE="$APP/Contents/MacOS/Gear"

STAGE="${1:-all}"

say() { printf '\n\033[1;32m━━ %s\033[0m\n' "$*"; }
note() { printf '   %s\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ── Preflight ────────────────────────────────────────────────────────────────

command -v gip >/dev/null || die "gip not on PATH — install gip-transport's binaries"
command -v 'git-remote-git+pear' >/dev/null ||
  die "git-remote-git+pear not on PATH — git cannot speak git+pear:// without it"

[ -d "$UPDATER" ] || die "pear-repo-updater not found at $UPDATER"
[ -d "$PEAR_INSTALL" ] || die "pear-install not found at $PEAR_INSTALL"

# Commit anything outstanding and push to the repo's gip remote. Both of Gear's
# git+pear dependencies live in sibling checkouts, and the rebuild clones Gear
# into a temp directory where no sibling exists — so whatever is not pushed is
# not in the build, whatever it says locally.
# The remote that speaks git+pear, whatever it is called — these repos name it
# `pear` or `origin` depending on how they were set up.
gip_remote() {
  git -C "$1" remote -v | awk '$3 == "(push)" && $2 ~ /^git\+pear:\/\// { print $1; exit }'
}

publish_repo() {
  local dir="$1" name="$2"
  local remote
  remote="$(gip_remote "$dir")"
  [ -n "$remote" ] || die "$name at $dir has no git+pear remote"
  say "publishing $name"
  cd "$dir"
  # A push needs a commit, but it does not need to be yours. Uncommitted work
  # goes out as a detached commit object: the demo gets the code it is about to
  # build, and the branch is left exactly where you put it. These are real
  # branches headed for real history — only the remote is disposable.
  local head
  head="$(git rev-parse HEAD)"
  if [ -n "$(git status --porcelain)" ]; then
    git add -A
    head="$(git stash create)"
    git reset -q
    note "publishing uncommitted work as $(git rev-parse --short "$head") (branch untouched)"
  fi
  # Forced, like the gear-demo push below: these branches get rebased and squashed
  # between runs, so the remote tip is routinely not an ancestor of HEAD. There is
  # no way to tell that apart from someone else's work, which is one more reason
  # this script is only for remotes whose history does not matter.
  git push -q --force "$remote" "${head}:refs/heads/main"
  note "pushed $(git rev-parse --short "$head") to $remote"
}

# The bundle layout below is macOS-specific. Linux would be Gear.AppImage and
# Windows an installed MSIX, both launched differently.
case "$HOST" in
  darwin-*) ;;
  *) die "this demo script only drives the macOS build, not $HOST" ;;
esac

# The app and the CLI both want an exclusive lock on ~/.gip.
if pgrep -f "$EXE" >/dev/null 2>&1; then
  say "stopping the running Gear"
  pkill -f "$EXE" || true
  sleep 1
fi

APP_VERSION="$(node -p "require('$ROOT/package.json').version")"
UPGRADE="$(node -p "require('$ROOT/package.json').upgrade")"

# Next patch after the highest version anyone has seen, so a re-run always
# publishes something newer than the app, the last run, and anything already on
# the remote. The remote is the one that matters and the one that gets missed:
# clearing local tags does not clear its, and the app follows its tags, not
# ours — so a local-only reading republishes versions it has long since passed.
# Its tags are read once, here, and the local tags and app version stand in
# when it cannot be reached.
REMOTE_TAGS="$(
  git -C "$ROOT" ls-remote --tags "$(gip_remote "$ROOT")" 2>/dev/null |
    awk '$2 ~ /^refs\/tags\/v[0-9]+\.[0-9]+\.[0-9]+$/ { sub(/^refs\/tags\/v/, "", $2); print $2 }' ||
    true
)"
LOCAL_TAGS="$(git -C "$ROOT" tag --list 'v[0-9]*' | sed 's/^v//' || true)"
REMOTE_VERSION="$(printf '%s\n' "$REMOTE_TAGS" | sort -t. -k1,1n -k2,2n -k3,3n | tail -1)"
REMOTE_VERSION="${REMOTE_VERSION:-0.0.0}"
NEXT_VERSION="$(printf '%s\n%s\n%s\n' "$REMOTE_TAGS" "$LOCAL_TAGS" "$APP_VERSION" | node -e "
  const seen = require('fs').readFileSync(0, 'utf8').split('\n')
    .map((v) => v.trim()).filter((v) => /^\d+\.\d+\.\d+\$/.test(v))
    .map((v) => v.split('.').map(Number));
  const [a, b, c] = seen.concat([[0, 0, 0]])
    .sort((x, y) => y[0] - x[0] || y[1] - x[1] || y[2] - x[2])[0];
  console.log([a, b, c + 1].join('.'));
")"

# What the running app will actually be offered: the release this run publishes,
# or — when publishing is being skipped — whatever the last run left on the
# remote.
if [ "$STAGE" = all ] || [ "$STAGE" = publish ]; then
  OFFERED="$NEXT_VERSION"
else
  OFFERED="$REMOTE_VERSION"
fi

say "plan"
note "host           $HOST"
note "app version    $APP_VERSION   (what gets built and launched)"
note "release        $OFFERED   (what gets offered as an update)"
note "upgrade link   $UPGRADE"

# An app already at or past the release sees no update at all, which looks like
# a broken updater rather than an empty remote. Only reachable with publishing
# skipped: a publish picks a version above both.
if [ "$(node -e "
  const parse = (v) => v.split('.').map(Number);
  const [[a, b, c], [x, y, z]] = ['$OFFERED', '$APP_VERSION'].map(parse);
  console.log(a > x || (a === x && (b > y || (b === y && c > z))) ? 'newer' : 'stale');
")" = stale ]; then
  note "               ^ not newer than the app — nothing will be offered; run publish"
fi

[ "$STAGE" = plan ] && exit 0

# ── Publish ──────────────────────────────────────────────────────────────────

if [ "$STAGE" = all ] || [ "$STAGE" = publish ]; then
  publish_repo "$PEAR_INSTALL" pear-install
  publish_repo "$UPDATER" pear-repo-updater

  say "publishing gear-demo $NEXT_VERSION"
  cd "$ROOT"
  if [ -n "$(git status --porcelain)" ]; then
    git add -A
    git commit -qm "demo: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    note "committed local changes"
  fi

  # The tagged commit must be the one whose package.json says NEXT_VERSION: the
  # running app compares its own version against the tag, and the rebuild reads
  # the version back out of the checkout it just cloned.
  npm --silent version "$NEXT_VERSION" --no-git-tag-version >/dev/null
  # Conditional: an interrupted earlier run can leave the version already set,
  # and `git commit` on an unchanged tree is a failure that would stop the demo.
  git diff --quiet || git commit -qam "$NEXT_VERSION"

  # The tag is created on the remote and nowhere else. A local tag would be
  # residue of a demo run — the remote is what the app reads, and what this
  # script reads back on the next run.
  git push -q --force "$(gip_remote "$ROOT")" \
    "HEAD:refs/heads/main" "HEAD:refs/tags/v$NEXT_VERSION"
  note "pushed v$NEXT_VERSION (remote tag only)"

  # Put the working tree back to the version the app is built at. Left
  # uncommitted on purpose — committing it would put a newer commit after the
  # tag on the next push.
  npm --silent version "$APP_VERSION" --no-git-tag-version >/dev/null
  note "working tree back to $APP_VERSION (uncommitted)"
fi

# ── Build ────────────────────────────────────────────────────────────────────

if [ "$STAGE" = all ] || [ "$STAGE" = build ]; then
  # The app bundles whatever is in node_modules, and a push alone does not change
  # that: npm records the resolved commit of a git+pear dependency in
  # package-lock.json, so a later `npm install` reinstalls that same commit no
  # matter what the remote now holds. `npm update` re-resolves the ref. Without
  # this step, pushing a dependency and then building is exactly how a change
  # appears to have no effect.
  #
  # No peer needed: the links carry no ?storage=, so this reads the same ~/.gip
  # that was just pushed to.
  say "re-resolving the git+pear dependencies"
  cd "$ROOT"
  # `npm update` keeps the locked commit when the url has not changed, so drop these
  # from the lock and let the install resolve them again. That is the only way a push
  # reaches the build.
  node -e '
    const fs = require("fs")
    const lock = JSON.parse(fs.readFileSync("package-lock.json"))
    for (const name of ["pear-install", "pear-repo-updater"]) {
      for (const key of Object.keys(lock.packages)) {
        if (key === "node_modules/" + name || key.startsWith("node_modules/" + name + "/")) {
          delete lock.packages[key]
        }
      }
    }
    fs.writeFileSync("package-lock.json", JSON.stringify(lock, null, 2) + "\n")
  '
  npm i
  note "pear-install      $(node -p "require('$ROOT/package-lock.json').packages['node_modules/pear-install'].resolved.split('#')[1].slice(0,7)")"
  note "pear-repo-updater $(node -p "require('$ROOT/package-lock.json').packages['node_modules/pear-repo-updater'].resolved.split('#')[1].slice(0,7)")"

  say "building Gear $APP_VERSION for $HOST"
  cd "$ROOT"
  npm run make -- --host "$HOST"
  [ -d "$APP" ] || die "expected $APP"
fi

# Stages are exact, not cumulative: `build` builds, it does not then launch.
case "$STAGE" in
  publish | build)
    say "done — $STAGE only"
    note "launch it with: scripts/demo-update.sh run"
    exit 0
    ;;
esac

[ -x "$EXE" ] || die "no built app at $EXE — run: scripts/demo-update.sh build"

# ── Run ──────────────────────────────────────────────────────────────────────

BUILT_VERSION="$(defaults read "$APP/Contents/Info" CFBundleShortVersionString 2>/dev/null ||
  echo "$APP_VERSION")"

say "launching Gear $BUILT_VERSION"

# No --port, and no flags at all: the packaged app cannot take any. The entry
# point sveltekit-adapter-bare generates parses process.argv.slice(2), which
# assumes an interpreter and a script ahead of the arguments. A standalone
# bare-build binary has only its own path, so the first flag is dropped and its
# value bails the parser — `Gear --port 7331` dies with UNKNOWN_ARG: 7331.
#
# So it listens on an OS-assigned port and announces it on stdout, and that is
# where the URL comes from.
#
# ~/.gip by default, which already has gear-demo from the push above — so the
# update is found without needing another peer. The rebuild clones through this
# process rather than opening the store a second time, which it cannot.
LOG="$ROOT/out/$HOST/demo.log"
: > "$LOG"
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
note "  1. 'Version $OFFERED is available' with an Install update button."
note "     Nothing has been built yet — the release was only resolved to an"
note "     immutable checkout."
note "  2. Click it. The rebuild starts: Cloning the release → Installing"
note "     dependencies → Building the app → Packaging the release → Staging"
note "     → Installing, with the build's own output underneath."
note "  3. 'Version $OFFERED installed', with the button now a Restart. Clicking"
note "     it closes this instance and launches the new one, which reports a"
note "     relaunch failure to relaunch.log beside the store."
note ""
note "App log below (also at $LOG)."
note "Ctrl-C closes the app. The gip store is ~/.gip, shared with the CLI, so"
note "don't run gip commands while this is up."
printf '\n'

tail -n +1 -f "$LOG" &
TAIL_PID=$!
wait "$APP_PID" || true
kill "$TAIL_PID" 2>/dev/null || true
