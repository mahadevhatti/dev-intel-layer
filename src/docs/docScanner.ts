import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { RepoDocument, DocType } from '../core/types.js';

interface ScanPattern {
  glob: string;
  docType: DocType;
  isDir: boolean;
}

const SCAN_PATTERNS: ScanPattern[] = [
  { glob: '.cursor/rules', docType: 'cursor-rule', isDir: true },
  { glob: '.cursorrules', docType: 'cursor-rule', isDir: false },
  { glob: 'AGENTS.md', docType: 'agent-guide', isDir: false },
  { glob: 'CLAUDE.md', docType: 'agent-guide', isDir: false },
  { glob: 'RULES.md', docType: 'agent-guide', isDir: false },
  { glob: 'CONTRIBUTING.md', docType: 'contributing', isDir: false },
  { glob: 'README.md', docType: 'readme', isDir: false },
  { glob: 'README', docType: 'readme', isDir: false },
  { glob: 'ARCHITECTURE.md', docType: 'architecture', isDir: false },
  { glob: 'DESIGN.md', docType: 'architecture', isDir: false },
  { glob: 'CHANGELOG.md', docType: 'changelog', isDir: false },
  { glob: 'docs', docType: 'docs', isDir: true },
];

export class DocScanner {
  scanRepo(repoPath: string, repoId: string): RepoDocument[] {
    const documents: RepoDocument[] = [];
    const now = new Date().toISOString();

    for (const pattern of SCAN_PATTERNS) {
      const fullPath = path.join(repoPath, pattern.glob);

      if (pattern.isDir) {
        if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) continue;
        this.scanDirectory(fullPath, repoPath, repoId, pattern.docType, documents, now);
      } else {
        if (!fs.existsSync(fullPath)) continue;
        const stat = fs.statSync(fullPath);
        if (!stat.isFile()) continue;
        const doc = this.createDocument(fullPath, repoPath, repoId, pattern.docType, stat, now);
        if (doc) documents.push(doc);
      }
    }

    return documents;
  }

  private scanDirectory(dirPath: string, repoPath: string, repoId: string, docType: DocType, documents: RepoDocument[], now: string): void {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          // Check for ADR subdirectory
          const subDocType = entry.name.toLowerCase() === 'adr' ? 'adr' as DocType : docType;
          this.scanDirectory(entryPath, repoPath, repoId, subDocType, documents, now);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          const stat = fs.statSync(entryPath);
          const doc = this.createDocument(entryPath, repoPath, repoId, docType, stat, now);
          if (doc) documents.push(doc);
        }
      }
    } catch { /* permission error, skip */ }
  }

  private createDocument(fullPath: string, repoPath: string, repoId: string, docType: DocType, stat: fs.Stats, now: string): RepoDocument | null {
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const relativePath = path.relative(repoPath, fullPath);
      const contentHash = createHash('sha256').update(content).digest('hex');

      // Derive title from first heading or filename
      const headingMatch = content.match(/^#\s+(.+)$/m);
      const title = headingMatch ? headingMatch[1].trim() : path.basename(fullPath, path.extname(fullPath));

      return {
        id: randomUUID(),
        repoId,
        filePath: relativePath,
        docType,
        title,
        contentHash,
        sizeBytes: stat.size,
        lastScannedAt: now,
        lastModifiedAt: stat.mtime.toISOString(),
      };
    } catch {
      return null;
    }
  }
}
