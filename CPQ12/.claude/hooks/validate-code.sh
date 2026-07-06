#!/bin/bash

# Hook: Validate Code Before Allowing Edits
# Runs: BEFORE Claude edits files
# Exit 0: Allow edit | Exit 2: Block edit

# Check 1: Don't allow editing .env or secrets
if [[ $1 == *".env"* ]] || [[ $1 == *"secret"* ]] || [[ $1 == *"credential"* ]]; then
  echo "❌ Cannot edit sensitive files (.env, secrets, credentials)"
  exit 2
fi

# Check 2: Don't allow editing critical system files
if [[ $1 == "package.json" ]] || [[ $1 == "package-lock.json" ]] || [[ $1 == ".git"* ]]; then
  echo "❌ Cannot edit critical system files"
  exit 2
fi

# Check 3: Don't allow editing node_modules
if [[ $1 == *"node_modules"* ]]; then
  echo "❌ Cannot edit node_modules (reinstall with npm install)"
  exit 2
fi

# All checks passed
echo "✓ File safe to edit: $1"
exit 0
