#!/bin/sh
# .git/hooks/pre-commit — installed by dev-intel

DIL_SERVER="http://localhost:4170"
REPO_ROOT=$(git rev-parse --show-toplevel)

if ! curl -s --max-time 2 "$DIL_SERVER/api/health" > /dev/null 2>&1; then
  echo "⚠ DIL: Server not running. Skipping KB sync check."
  echo "   Start it with: npx dev-intel serve"
  exit 0
fi

STAGED_FILES=$(git diff --cached --name-only | sort)
DIFF_CONTENT=$(git diff --cached)
CURRENT_HASH=$(printf '%s\n---\n%s' "$STAGED_FILES" "$DIFF_CONTENT" | shasum -a 256 | cut -d' ' -f1)

MANIFEST_HASH=$(curl -s "$DIL_SERVER/api/repos/manifest?repoPath=$REPO_ROOT" \
  | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).stagedHash)}catch{console.log('UNKNOWN')}})")

if [ "$MANIFEST_HASH" = "UNKNOWN" ]; then
  echo "⚠ DIL: Repo not registered with DIL server. Skipping check."
  exit 0
fi

if [ "$CURRENT_HASH" != "$MANIFEST_HASH" ]; then
  echo ""
  echo "❌ DIL: Knowledge base is out of sync with staged changes."
  echo ""
  echo "   Staged hash:   $CURRENT_HASH"
  echo "   Manifest hash:  $MANIFEST_HASH"
  echo ""
  echo "   → Open your AI agent and run:"
  echo "     \"Sync knowledge base for current changes\""
  echo ""
  exit 1
fi

exit 0
