#!/usr/bin/env bash
# Runs the Python of bump-version.yml's "Raise the version" step on small fixtures and checks which
# files it changes: the version file, a package-lock.json or Cargo.lock beside it, and the member's
# entry in a Bun workspace's bun.lock. Needs python3 with PyYAML and bun.
# Usage: tests/bump-version/test.sh
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
workflow=$here/../../.github/workflows/bump-version.yml
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT

# The step's script, exactly as the workflow runs it (shell: python)
python3 - "$workflow" "$work/bump.py" <<'PY'
import sys, yaml
steps = yaml.safe_load(open(sys.argv[1]))["jobs"]["bump"]["steps"]
open(sys.argv[2], "w").write(next(s for s in steps if s.get("id") == "bump")["run"])
PY

failures=0
fail() { echo "  FAIL: $*"; failures=$((failures + 1)); }
check() { if eval "$2"; then echo "  ok: $1"; else fail "$1"; fi; }
version_of() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$1"; }
# The version in bun.lock's workspaces entry $2 (the file is JSON with trailing commas)
lock_version() {
  python3 -c '
import json, re, sys
text = re.sub(r",(\s*[}\]])", r"\1", open(sys.argv[1]).read())
print(json.loads(text)["workspaces"][sys.argv[2]].get("version", "-"))' "$1" "$2"
}
# bump <dir> <version-file> [bump]: runs the step in <dir>; the output "files" goes to $dir/.files
bump() {
  (cd "$1" && : > .out && GITHUB_OUTPUT=.out BUMP=${3:-minor} PREID=rc VERSION_FILE=$2 EXTRA_FILES="" \
    TAG_PREFIX=v python3 "$work/bump.py" && sed -n 's/^files=//p' .out > .files)
}
files_has() { grep -qw -- "$2" "$1/.files"; }
# A Bun workspace: root package $1 (JSON), members apps/web and apps/api at 1.3.3
bun_workspace() {
  mkdir -p "$2/apps/web" "$2/apps/api"
  echo "$1" > "$2/package.json"
  echo '{"name": "web", "version": "1.3.3", "dependencies": {"api": "workspace:*"}}' > "$2/apps/web/package.json"
  echo '{"name": "api", "version": "1.3.3"}' > "$2/apps/api/package.json"
  (cd "$2" && bun install >/dev/null 2>&1)
}

echo "Bun workspace, version file is the member apps/web/package.json"
d=$work/member
bun_workspace '{"name": "root", "private": true, "workspaces": ["apps/*"]}' "$d"
bump "$d" apps/web/package.json
check "apps/web/package.json at 1.4.0" '[[ $(version_of "$d/apps/web/package.json") == 1.4.0 ]]'
check "bun.lock: apps/web at 1.4.0" '[[ $(lock_version "$d/bun.lock" apps/web) == 1.4.0 ]]'
check "bun.lock: apps/api stays at 1.3.3" '[[ $(lock_version "$d/bun.lock" apps/api) == 1.3.3 ]]'
check "bun.lock is in the release commit" 'files_has "$d" bun.lock'
cp "$d/bun.lock" "$work/bumped.lock"
check "bun install --frozen-lockfile accepts it" '(cd "$d" && bun install --frozen-lockfile >/dev/null 2>&1)'
check "bun install --frozen-lockfile leaves it as it is" 'cmp -s "$work/bumped.lock" "$d/bun.lock"'
check "bun install leaves it as it is" '(cd "$d" && bun install >/dev/null 2>&1) && cmp -s "$work/bumped.lock" "$d/bun.lock"'

echo "Bun workspace, bun.lock already stale (an earlier bump without it)"
d=$work/stale
bun_workspace '{"name": "root", "private": true, "workspaces": ["apps/*"]}' "$d"
sed -i 's/"version": "1.3.3"/"version": "1.3.4"/' "$d/apps/web/package.json"
bump "$d" apps/web/package.json patch
check "bun.lock: apps/web at 1.3.5" '[[ $(lock_version "$d/bun.lock" apps/web) == 1.3.5 ]]'
cp "$d/bun.lock" "$work/bumped.lock"
check "bun install leaves it as it is" '(cd "$d" && bun install >/dev/null 2>&1) && cmp -s "$work/bumped.lock" "$d/bun.lock"'

echo "Bun workspace, version file is the root package.json"
d=$work/root
bun_workspace '{"name": "root", "version": "2.0.0", "private": true, "workspaces": ["apps/*"]}' "$d"
cp "$d/bun.lock" "$work/before.lock"
bump "$d" package.json
check "package.json at 2.1.0" '[[ $(version_of "$d/package.json") == 2.1.0 ]]'
check "bun.lock untouched" 'cmp -s "$work/before.lock" "$d/bun.lock"'
check "bun.lock not in the release commit" '! files_has "$d" bun.lock'

echo "package.json with a package-lock.json beside it"
d=$work/npm; mkdir -p "$d"
echo '{"name": "app", "version": "1.2.3", "dependencies": {"dep": "^1.2.3"}}' > "$d/package.json"
cat > "$d/package-lock.json" <<'JSON'
{
  "name": "app",
  "version": "1.2.3",
  "lockfileVersion": 3,
  "packages": {
    "": {"name": "app", "version": "1.2.3", "dependencies": {"dep": "^1.2.3"}},
    "node_modules/dep": {"version": "1.2.3"}
  }
}
JSON
bump "$d" package.json
check "package-lock.json: root and packages[\"\"] at 1.3.0, the dependency at 1.2.3" \
  '[[ $(python3 -c "import json; l = json.load(open(\"$d/package-lock.json\")); p = l[\"packages\"]; print(l[\"version\"], p[\"\"][\"version\"], p[\"node_modules/dep\"][\"version\"])") == "1.3.0 1.3.0 1.2.3" ]]'
check "package-lock.json in the release commit" 'files_has "$d" package-lock.json'

echo "Cargo.toml with a Cargo.lock beside it"
d=$work/cargo; mkdir -p "$d"
printf '[package]\nname = "app"\nversion = "1.2.3"\n' > "$d/Cargo.toml"
cat > "$d/Cargo.lock" <<'LOCK'
version = 4

[[package]]
name = "app"
version = "1.2.3"
dependencies = [
 "dep",
]

[[package]]
name = "dep"
version = "1.2.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
LOCK
bump "$d" Cargo.toml
check "Cargo.toml at 1.3.0" 'grep -qx "version = \"1.3.0\"" "$d/Cargo.toml"'
check "Cargo.lock: app at 1.3.0, the registry crate at 1.2.3" \
  '[[ $(grep -c "^version = \"1.3.0\"" "$d/Cargo.lock") == 1 && $(grep -c "^version = \"1.2.3\"" "$d/Cargo.lock") == 1 ]] && grep -A1 "name = \"app\"" "$d/Cargo.lock" | grep -q 1.3.0'
check "Cargo.lock in the release commit" 'files_has "$d" Cargo.lock'

if ((failures)); then echo "$failures failed"; exit 1; fi
echo "all passed"
