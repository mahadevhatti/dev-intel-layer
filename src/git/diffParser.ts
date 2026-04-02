export interface DiffFile {
  filePath: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  oldPath?: string;
  additions: number;
  deletions: number;
}

export function parseDiffStat(diffOutput: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = diffOutput.split('\n');

  let currentFile: Partial<DiffFile> | null = null;
  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      if (currentFile?.filePath) {
        files.push({
          filePath: currentFile.filePath,
          status: currentFile.status ?? 'modified',
          oldPath: currentFile.oldPath,
          additions,
          deletions,
        });
      }

      currentFile = {};
      additions = 0;
      deletions = 0;

      const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      if (match) {
        currentFile.filePath = match[2];
        if (match[1] !== match[2]) {
          currentFile.oldPath = match[1];
          currentFile.status = 'renamed';
        }
      }
    } else if (line.startsWith('new file mode')) {
      if (currentFile) currentFile.status = 'added';
    } else if (line.startsWith('deleted file mode')) {
      if (currentFile) currentFile.status = 'deleted';
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
    }
  }

  if (currentFile?.filePath) {
    files.push({
      filePath: currentFile.filePath,
      status: currentFile.status ?? 'modified',
      oldPath: currentFile.oldPath,
      additions,
      deletions,
    });
  }

  return files;
}

export function extractAffectedSymbols(diffOutput: string): Map<string, string[]> {
  const symbolsByFile = new Map<string, string[]>();
  const lines = diffOutput.split('\n');

  let currentFile: string | null = null;
  const currentSymbols = new Set<string>();

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      if (currentFile && currentSymbols.size > 0) {
        symbolsByFile.set(currentFile, [...currentSymbols]);
      }
      currentSymbols.clear();

      const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      currentFile = match ? match[2] : null;
    } else if (line.startsWith('@@')) {
      const funcMatch = line.match(/@@.*@@\s+(.+)/);
      if (funcMatch) {
        const context = funcMatch[1].trim();
        if (context) currentSymbols.add(context);
      }
    }
  }

  if (currentFile && currentSymbols.size > 0) {
    symbolsByFile.set(currentFile, [...currentSymbols]);
  }

  return symbolsByFile;
}
