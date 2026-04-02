#!/bin/sh
# .git/hooks/pre-commit — installed by cortex

CORTEX_SERVER="http://localhost:4170"
REPO_ROOT=$(git rev-parse --show-toplevel)

if ! curl -s --max-time 2 "$CORTEX_SERVER/api/health" > /dev/null 2>&1; then
  echo "⚠ Cortex: Server not running. Skipping KB sync check."
  echo "   Start it with: npx cortex serve"
  exit 0
fi

CURRENT_HASH=$(node -e "
  const crypto = require('crypto');
  const { execSync } = require('child_process');
  const staged = execSync('git diff --cached --name-only', {encoding:'utf-8'}).trim().split('\n').filter(Boolean).sort();
  const diff = execSync('git diff --cached', {encoding:'utf-8'});
  const payload = staged.join('\n') + '\n---\n' + diff;
  process.stdout.write(crypto.createHash('sha256').update(payload).digest('hex'));
")

MANIFEST_HASH=$(curl -s "$CORTEX_SERVER/api/repos/manifest?repoPath=$REPO_ROOT" \
  | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).stagedHash)}catch{console.log('UNKNOWN')}})")

if [ "$MANIFEST_HASH" = "UNKNOWN" ]; then
  echo "⚠ Cortex: Repo not registered with Cortex server. Skipping check."
  exit 0
fi

if [ "$CURRENT_HASH" != "$MANIFEST_HASH" ]; then
  echo ""
  echo "❌ Cortex: Knowledge base is out of sync with staged changes."
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
