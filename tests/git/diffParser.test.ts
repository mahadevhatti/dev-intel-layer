import { describe, it, expect } from 'vitest';
import { parseDiffStat, extractAffectedSymbols } from '../../src/git/diffParser.js';

const SAMPLE_DIFF = `diff --git a/src/auth.ts b/src/auth.ts
index abc..def 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,5 +1,7 @@ export class AuthService {
 export class AuthService {
+  private logger: Logger;
+
   async login(user: string, pass: string) {
-    return fetch('/api/login');
+    return this.apiClient.post('/api/login', { user, pass });
   }
 }
diff --git a/src/newFile.ts b/src/newFile.ts
new file mode 100644
--- /dev/null
+++ b/src/newFile.ts
@@ -0,0 +1,3 @@
+export function helper() {
+  return true;
+}
diff --git a/src/deleted.ts b/src/deleted.ts
deleted file mode 100644
--- a/src/deleted.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-export function old() {
-  return false;
-}`;

describe('parseDiffStat', () => {
  it('parses modified files', () => {
    const files = parseDiffStat(SAMPLE_DIFF);
    const auth = files.find((f) => f.filePath === 'src/auth.ts');
    expect(auth).toBeDefined();
    expect(auth!.status).toBe('modified');
    expect(auth!.additions).toBe(3);
    expect(auth!.deletions).toBe(1);
  });

  it('parses new files', () => {
    const files = parseDiffStat(SAMPLE_DIFF);
    const newFile = files.find((f) => f.filePath === 'src/newFile.ts');
    expect(newFile).toBeDefined();
    expect(newFile!.status).toBe('added');
    expect(newFile!.additions).toBe(3);
    expect(newFile!.deletions).toBe(0);
  });

  it('parses deleted files', () => {
    const files = parseDiffStat(SAMPLE_DIFF);
    const deleted = files.find((f) => f.filePath === 'src/deleted.ts');
    expect(deleted).toBeDefined();
    expect(deleted!.status).toBe('deleted');
    expect(deleted!.deletions).toBe(3);
  });

  it('returns all files', () => {
    const files = parseDiffStat(SAMPLE_DIFF);
    expect(files).toHaveLength(3);
  });

  it('handles empty input', () => {
    expect(parseDiffStat('')).toEqual([]);
  });
});

describe('extractAffectedSymbols', () => {
  it('extracts function context from hunk headers', () => {
    const symbols = extractAffectedSymbols(SAMPLE_DIFF);
    const authSymbols = symbols.get('src/auth.ts');
    expect(authSymbols).toBeDefined();
    expect(authSymbols).toContain('export class AuthService {');
  });

  it('returns empty map for empty diff', () => {
    const symbols = extractAffectedSymbols('');
    expect(symbols.size).toBe(0);
  });
});
