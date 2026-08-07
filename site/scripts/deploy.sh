#!/usr/bin/env bash
#
# Publish the built site to the repository root.
#
# WHY THIS EXISTS
# ---------------
# The Eclipse Foundation website job checks out the `main` branch of this
# repository and serves its ROOT byte-for-byte at https://eclipse.dev/atesor.
# There is no server-side build step, so the generated HTML/CSS/JS has to be
# committed at the top level. Astro cannot build straight into the repo root
# because it empties its own outDir — which would delete .git and site/.
#
# So: build into site/dist, then sync that output up to the root.
#
# SAFETY
# ------
# Only files this script published on a previous run are ever removed, and
# only via the manifest it writes (.published-files). Anything else at the
# root — .git, site/, .github/, README.md, .gitignore — is never touched.
#
# Usage:
#   ./scripts/deploy.sh            # build + publish
#   ./scripts/deploy.sh --dry-run  # show what would change, touch nothing

set -euo pipefail

SITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$SITE_DIR/.." && pwd)"
DIST="$SITE_DIR/dist"
MANIFEST="$REPO_ROOT/.published-files"

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

# Never let a mistake here escape into the repo internals.
PROTECTED=(".git" "site" ".github" "README.md" ".gitignore" ".published-files")

# BLD-01. The allowlist below only inspects the FIRST path segment, so a
# manifest line like `../../evil` yields top=".." — which matches nothing and
# would be deleted from outside the repo. The manifest is machine-generated
# from `find dist -printf '%P'` and never contains such a path, but nothing
# enforced that. Reject traversal and absolute paths outright.
is_unsafe_rel() {
  case "$1" in
    /*|*/../*|../*|*/..|..) return 0 ;;
  esac
  return 1
}

is_protected() {
  local top="${1%%/*}"
  for p in "${PROTECTED[@]}"; do
    [[ "$top" == "$p" ]] && return 0
  done
  return 1
}

say() { printf '  %s\n' "$1"; }

# ---------------------------------------------------------------- sanity ----
if [[ ! -d "$REPO_ROOT/.git" ]]; then
  echo "error: $REPO_ROOT is not a git repository — refusing to publish." >&2
  exit 1
fi

# ----------------------------------------------------------------- build ----
if [[ $DRY_RUN -eq 0 ]]; then
  echo "==> Building"
  ( cd "$SITE_DIR" && npm run build )
else
  echo "==> Dry run (skipping build; using existing dist/)"
fi

if [[ ! -f "$DIST/index.html" ]]; then
  echo "error: $DIST/index.html not found — build produced no output." >&2
  exit 1
fi

# Astro collapses a newline between prose and an inline tag, silently gluing
# words together ("licensed under theMIT License"). Cheap to check, and it
# already shipped four times before this guard existed.
echo "==> Checking prose spacing"
while IFS= read -r page; do
  printf '  %s: ' "${page#$DIST/}"
  node "$SITE_DIR/scripts/check-spacing.mjs" "$page"
done < <(find "$DIST" -name '*.html' | sort)

# --------------------------------------------------------- publish new ----
# BLD-02. Copy BEFORE deleting. The previous order removed every published
# file first, so an interrupt (Ctrl-C, OOM, full disk) between the two loops
# left the served root with index.html gone and the replacement not yet
# written. Copying first means every path is either the old file or the new
# one at all times — never absent.
echo "==> Publishing dist/ to repository root"
NEW_MANIFEST="$(mktemp)"

while IFS= read -r rel; do
  if is_unsafe_rel "$rel"; then
    say "SKIP (unsafe path): $rel"
    continue
  fi
  if is_protected "$rel"; then
    say "SKIP (protected): $rel"
    continue
  fi
  say "+ $rel"
  echo "$rel" >> "$NEW_MANIFEST"
  if [[ $DRY_RUN -eq 0 ]]; then
    mkdir -p "$REPO_ROOT/$(dirname "$rel")"
    cp "$DIST/$rel" "$REPO_ROOT/$rel"
  fi
done < <( cd "$DIST" && find . -type f -printf '%P\n' | sort )

# ------------------------------------------------- remove stale artefacts ----
# Only files the previous deploy published that this one did NOT re-publish.
echo "==> Removing files no longer published"
if [[ -f "$MANIFEST" ]]; then
  while IFS= read -r rel; do
    [[ -z "$rel" ]] && continue
    if is_unsafe_rel "$rel"; then
      say "SKIP (unsafe path): $rel"
      continue
    fi
    if is_protected "$rel"; then
      say "SKIP (protected): $rel"
      continue
    fi
    # Still in the new build? Then it was just overwritten, not orphaned.
    if grep -qxF "$rel" "$NEW_MANIFEST" 2>/dev/null; then
      continue
    fi
    target="$REPO_ROOT/$rel"
    if [[ -e "$target" ]]; then
      say "rm $rel"
      [[ $DRY_RUN -eq 0 ]] && rm -f "$target"
    fi
  done < "$MANIFEST"

  # Drop directories the removals emptied. Scoped to the published tree so an
  # unrelated empty top-level directory is never swept up (SEC-08).
  if [[ $DRY_RUN -eq 0 ]]; then
    for d in "$REPO_ROOT/_astro" "$REPO_ROOT/assets" "$REPO_ROOT/downloads"; do
      [[ -d "$d" ]] && find "$d" -mindepth 0 -type d -empty -delete 2>/dev/null || true
    done
  fi
else
  say "(no manifest yet — first publish)"
fi

if [[ $DRY_RUN -eq 0 ]]; then
  mv "$NEW_MANIFEST" "$MANIFEST"
  echo "==> Wrote $MANIFEST ($(wc -l < "$MANIFEST") files)"
  echo
  echo "Done. Review with 'git status', then commit and push the ROOT files."
  echo "The Eclipse job publishes to https://eclipse.dev/atesor within ~5 min."
else
  rm -f "$NEW_MANIFEST"
  echo "==> Dry run complete; nothing was changed."
fi
