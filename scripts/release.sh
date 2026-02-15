#!/bin/bash
# Bump version and create GitHub release
# Usage: ./release.sh [patch|minor|major]

set -e

# Default to patch if no argument
VERSION_TYPE=${1:-patch}

# Validate version type
if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo "❌ Invalid version type: $VERSION_TYPE"
  echo "Usage: $0 [patch|minor|major]"
  exit 1
fi

# Ensure working directory is clean
if [[ -n $(git status -s) ]]; then
  echo "❌ Working directory is not clean. Commit or stash changes first."
  exit 1
fi

# Bump version
echo "📦 Bumping $VERSION_TYPE version..."
npm version $VERSION_TYPE -m "chore: release v%s"

# Get new version
NEW_VERSION=$(node -p "require('./package.json').version")
echo "✅ Version bumped to: $NEW_VERSION"

# Push tag and code
echo "🚀 Pushing to GitHub..."
git push --follow-tags

# Create GitHub release
echo "🎉 Creating GitHub release..."
gh release create "v$NEW_VERSION" \
  --title "v$NEW_VERSION" \
  --generate-notes \
  --verify-tag

echo "✅ Release v$NEW_VERSION created!"
echo "🔗 https://github.com/qiaolei81/copilot-session-viewer/releases/tag/v$NEW_VERSION"
