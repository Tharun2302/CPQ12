#!/bin/bash

# Hook: Auto-Format Code After Edit
# Runs: AFTER Claude edits files
# Automatically formats code to maintain style consistency

FILE=$1

# Check if file is JavaScript/JSX
if [[ $FILE == *.js ]] || [[ $FILE == *.jsx ]] || [[ $FILE == *.cjs ]]; then

  # Run prettier if available
  if command -v prettier &> /dev/null; then
    echo "📝 Formatting $FILE with prettier..."
    prettier --write "$FILE" 2>/dev/null
  fi

  # Run eslint fix if available
  if command -v eslint &> /dev/null; then
    echo "🔧 Linting $FILE with eslint..."
    eslint --fix "$FILE" 2>/dev/null
  fi
fi

# Check if file is JSON
if [[ $FILE == *.json ]]; then
  if command -v prettier &> /dev/null; then
    echo "📝 Formatting JSON $FILE..."
    prettier --write "$FILE" 2>/dev/null
  fi
fi

echo "✓ Auto-format complete: $FILE"
exit 0
