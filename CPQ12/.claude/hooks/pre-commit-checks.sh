#!/bin/bash

# Hook: Pre-Commit Validation
# Runs: BEFORE Claude commits code
# Exit 0: Allow commit | Exit 2: Block commit

echo "🔍 Running pre-commit checks..."

# Check 1: No console.log statements
if git diff --cached | grep -q "console\.log"; then
  echo "❌ Commit blocked: Found console.log() statements"
  echo "   Remove all console.log() before committing"
  exit 2
fi

# Check 2: No TODO comments
if git diff --cached | grep -q "TODO"; then
  echo "⚠️  Warning: Found TODO comments (allowed, but clean up soon)"
fi

# Check 3: No debugging statements
if git diff --cached | grep -q "debugger"; then
  echo "❌ Commit blocked: Found 'debugger' statement"
  echo "   Remove before committing"
  exit 2
fi

# Check 4: No .env file being committed
if git diff --cached --name-only | grep -q "\.env$"; then
  echo "❌ Commit blocked: Cannot commit .env file"
  echo "   Add .env to .gitignore if not already there"
  exit 2
fi

# Check 5: Commit message should not be empty
COMMIT_MSG=$(git diff --cached --diff-filter=M --name-only)
if [ -z "$COMMIT_MSG" ]; then
  echo "⚠️  Warning: Empty commit (no changes staged)"
fi

echo "✓ All pre-commit checks passed"
exit 0
