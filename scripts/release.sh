#!/usr/bin/env bash
# Release script for koko-agents-observe.
# Bumps version, generates changelog via Claude, opens editor for review,
# then commits, tags, and pushes.
#
# The base version is read from the VERSION file (source of truth).
#
# Usage: scripts/release.sh [--dry-run] [patch|minor|major|X.Y.Z]
#   e.g.  scripts/release.sh            # 1.2.0 → 1.2.1 (patch is the default)
#         scripts/release.sh minor      # 1.2.0 → 1.3.0
#         scripts/release.sh major      # 1.2.0 → 2.0.0
#         scripts/release.sh 1.4.0      # explicit version
#         scripts/release.sh --dry-run minor

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

USAGE="Usage: scripts/release.sh [--dry-run] [patch|minor|major|X.Y.Z]"

DRY_RUN=false
BUMP="patch"
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    -h|--help) echo "$USAGE"; exit 0 ;;
    *) BUMP="${arg#v}" ;;
  esac
done

# ── Compute version from VERSION file ───────────────────

SEMVER_RE='^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'  # no leading zeros (bash arithmetic would read them as octal)

CURRENT="$(tr -d '[:space:]' < VERSION)"
if ! [[ "$CURRENT" =~ $SEMVER_RE ]]; then
  echo "Error: VERSION file contains '$CURRENT', expected X.Y.Z"
  exit 1
fi
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "$BUMP" in
  patch) VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))" ;;
  minor) VERSION="${MAJOR}.$((MINOR + 1)).0" ;;
  major) VERSION="$((MAJOR + 1)).0.0" ;;
  *)
    if ! [[ "$BUMP" =~ $SEMVER_RE ]]; then
      echo "Error: unknown argument '$BUMP'"
      echo "$USAGE"
      exit 1
    fi
    VERSION="$BUMP"
    ;;
esac

TAG="v${VERSION}"

echo ""
echo "  v${CURRENT} → ${TAG} (${BUMP})"
echo ""

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Error: tag $TAG already exists"
  exit 1
fi

if ! $DRY_RUN && [ -n "$(git status --porcelain)" ]; then
  echo "Error: working directory is not clean — commit or stash changes first"
  exit 1
fi

# Make sure all hooks are properly configured in the hooks files
echo ""
if bun run ./scripts/check-hooks.ts; then
  echo "All hooks properly configured"
else
  echo "Fix the hooks before releasing"
  exit 1
fi

echo "=== Releasing $TAG ==="

# ── Generate changelog ──────────────────────────────────

scripts/generate-changelog.sh "$VERSION"

# Open in editor for review
EDITOR="${VISUAL:-${EDITOR:-vi}}"
echo ""
echo "Opening CHANGELOG.md in $EDITOR for review..."
echo "Save and close when done. Ctrl-C to abort the release."
# Unquoted so multi-word editors like "code --wait" split into command + args
$EDITOR CHANGELOG.md

# Verify the new version appears in CHANGELOG.md
if ! grep -q "## $TAG" CHANGELOG.md; then
  echo "Error: CHANGELOG.md does not contain an entry for $TAG"
  echo "The entry must include a line starting with: ## $TAG"
  exit 1
fi

echo "Changelog entry for $TAG confirmed."

# ── Bump versions ────────────────────────────────────────

echo ""
echo "Bumping version to $VERSION..."

# VERSION file (source of truth for server + CLI)
echo "$VERSION" > VERSION

# package.json (root)
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" package.json

# .claude-plugin/plugin.json (static manifest — can't read files)
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" .claude-plugin/plugin.json

# ── Test and build ───────────────────────────────────────

echo ""
echo "=== Running tests ==="
npm test

echo ""
echo "=== Building Docker image ==="
docker build -t koko-agents-observe:local .

echo ""
echo "=== Running fresh install test ==="
scripts/test-fresh-install.sh --skip-build

if $DRY_RUN; then
  echo ""
  echo "=== Dry run complete ==="
  echo "Changelog, version bumps, tests, and Docker build all passed."
  echo "Modified files (not committed):"
  git status --short
  echo ""
  echo "To finish the release, revert changes and run without --dry-run:"
  echo "  git checkout -- VERSION package.json .claude-plugin/plugin.json CHANGELOG.md"
  echo "  scripts/release.sh $VERSION"
  exit 0
fi

# ── Commit, tag, push ────────────────────────────────────

echo ""
echo "Committing release..."
git add VERSION package.json .claude-plugin/plugin.json CHANGELOG.md
git commit -m "release: v${VERSION}"

echo "Tagging $TAG..."
git tag -m "Release $TAG" "$TAG"

echo "Pushing to origin..."
git push origin main "$TAG"

echo ""
echo "=== Released $TAG ==="
echo "GitHub Actions will build the Docker image and create the GitHub release."
echo "Watch: https://github.com/diegorv/koko-agents-observe/actions"
