#!/bin/bash
# Block git commit/push on main branch
# Used as a PreToolUse hook for Bash tool calls

INPUT=$(cat)
CMD=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('input',{}).get('command',''))" 2>/dev/null)

if echo "$CMD" | grep -qiE "^\s*git\s+(commit|push)"; then
  BRANCH=$(git branch --show-current 2>/dev/null)
  if [ "$BRANCH" = "main" ]; then
    echo "BLOCKED: Cannot commit/push on main. Create a feature branch from main." >&2
    exit 2
  fi
fi

exit 0
