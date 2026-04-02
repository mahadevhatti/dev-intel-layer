#!/bin/sh
# .git/hooks/post-merge — installed by cortex

CORTEX_SERVER="http://localhost:4170"
REPO_ROOT=$(git rev-parse --show-toplevel)
curl -s -X POST "$CORTEX_SERVER/api/repos/notify" \
  -H "Content-Type: application/json" \
  -d "{\"repoPath\":\"$REPO_ROOT\",\"event\":\"post-merge\"}" > /dev/null 2>&1
