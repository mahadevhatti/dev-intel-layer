import fs from 'node:fs';
import path from 'node:path';

const PRE_COMMIT_HOOK = `#!/bin/sh
# .git/hooks/pre-commit — installed by dev-intel

DIL_SERVER="http://localhost:4170"
REPO_ROOT=$(git rev-parse --show-toplevel)

if ! curl -s --max-time 2 "$DIL_SERVER/api/health" > /dev/null 2>&1; then
  echo "⚠ DIL: Server not running. Skipping KB sync check."
  echo "   Start it with: npx dev-intel serve"
  exit 0
fi

CURRENT_HASH=$(node -e "
  const crypto = require('crypto');
  const { execSync } = require('child_process');
  const staged = execSync('git diff --cached --name-only', {encoding:'utf-8'}).trim().split('\\n').filter(Boolean).sort();
  const diff = execSync('git diff --cached', {encoding:'utf-8'});
  const payload = staged.join('\\n') + '\\n---\\n' + diff;
  process.stdout.write(crypto.createHash('sha256').update(payload).digest('hex'));
")

MANIFEST_HASH=$(curl -s "$DIL_SERVER/api/repos/manifest?repoPath=$REPO_ROOT" \\
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
  echo "     \\"Sync knowledge base for current changes\\""
  echo ""
  exit 1
fi

exit 0
`;

const POST_MERGE_HOOK = `#!/bin/sh
# .git/hooks/post-merge — installed by dev-intel

DIL_SERVER="http://localhost:4170"
REPO_ROOT=$(git rev-parse --show-toplevel)
curl -s -X POST "$DIL_SERVER/api/repos/notify" \\
  -H "Content-Type: application/json" \\
  -d "{\\"repoPath\\":\\"$REPO_ROOT\\",\\"event\\":\\"post-merge\\"}" > /dev/null 2>&1
`;

const POST_CHECKOUT_HOOK = `#!/bin/sh
# .git/hooks/post-checkout — installed by dev-intel

DIL_SERVER="http://localhost:4170"
REPO_ROOT=$(git rev-parse --show-toplevel)
NEW_BRANCH=$(git rev-parse --abbrev-ref HEAD)
curl -s -X POST "$DIL_SERVER/api/repos/notify" \\
  -H "Content-Type: application/json" \\
  -d "{\\"repoPath\\":\\"$REPO_ROOT\\",\\"event\\":\\"post-checkout\\",\\"branch\\":\\"$NEW_BRANCH\\"}" > /dev/null 2>&1
`;

const HOOKS: Record<string, string> = {
  'pre-commit': PRE_COMMIT_HOOK,
  'post-merge': POST_MERGE_HOOK,
  'post-checkout': POST_CHECKOUT_HOOK,
};

const DIL_MARKER = '# .git/hooks/';

export function installHooks(
  repoPath: string,
  hookTypes: string[] = ['pre-commit', 'post-merge', 'post-checkout'],
): { installed: string[]; skipped: string[] } {
  const hooksDir = path.join(repoPath, '.git', 'hooks');

  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  const installed: string[] = [];
  const skipped: string[] = [];

  for (const hookType of hookTypes) {
    const hookContent = HOOKS[hookType];
    if (!hookContent) {
      skipped.push(hookType);
      continue;
    }

    const hookPath = path.join(hooksDir, hookType);

    if (fs.existsSync(hookPath)) {
      const existing = fs.readFileSync(hookPath, 'utf-8');
      if (existing.includes(DIL_MARKER)) {
        fs.writeFileSync(hookPath, hookContent, { mode: 0o755 });
        installed.push(hookType);
        continue;
      }
      skipped.push(hookType);
      continue;
    }

    fs.writeFileSync(hookPath, hookContent, { mode: 0o755 });
    installed.push(hookType);
  }

  return { installed, skipped };
}

export function uninstallHooks(
  repoPath: string,
  hookTypes: string[] = ['pre-commit', 'post-merge', 'post-checkout'],
): { removed: string[]; skipped: string[] } {
  const hooksDir = path.join(repoPath, '.git', 'hooks');
  const removed: string[] = [];
  const skipped: string[] = [];

  for (const hookType of hookTypes) {
    const hookPath = path.join(hooksDir, hookType);

    if (!fs.existsSync(hookPath)) {
      skipped.push(hookType);
      continue;
    }

    const content = fs.readFileSync(hookPath, 'utf-8');
    if (content.includes(DIL_MARKER)) {
      fs.unlinkSync(hookPath);
      removed.push(hookType);
    } else {
      skipped.push(hookType);
    }
  }

  return { removed, skipped };
}
