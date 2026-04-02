#!/bin/sh
# .git/hooks/post-checkout — installed by dev-intel

DIL_SERVER="http://localhost:4170"
REPO_ROOT=$(git rev-parse --show-toplevel)
NEW_BRANCH=$(git rev-parse --abbrev-ref HEAD)
curl -s -X POST "$DIL_SERVER/api/repos/notify" \
  -H "Content-Type: application/json" \
  -d "{\"repoPath\":\"$REPO_ROOT\",\"event\":\"post-checkout\",\"branch\":\"$NEW_BRANCH\"}" > /dev/null 2>&1
