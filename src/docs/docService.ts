import fs from 'node:fs';
import path from 'node:path';
import type { StorageService } from '../core/storage.js';
import type { RepoDocument, DocType } from '../core/types.js';
import { DocScanner } from './docScanner.js';

export class DocService {
  private scanner: DocScanner;
  private storage: StorageService;

  constructor(storage: StorageService) {
    this.storage = storage;
    this.scanner = new DocScanner();
  }

  scanAndSync(repoId: string, repoPath: string): { added: number; updated: number; removed: number } {
    const scannedDocs = this.scanner.scanRepo(repoPath, repoId);
    const existingDocs = this.storage.listDocuments(repoId);
    const existingByPath = new Map(existingDocs.map(d => [d.filePath, d]));
    const scannedPaths = new Set(scannedDocs.map(d => d.filePath));

    let added = 0;
    let updated = 0;

    for (const doc of scannedDocs) {
      const existing = existingByPath.get(doc.filePath);
      if (existing) {
        if (existing.contentHash !== doc.contentHash) {
          doc.id = existing.id;
          this.storage.upsertDocument(doc);
          updated++;
        }
      } else {
        this.storage.upsertDocument(doc);
        added++;
      }
    }

    // Remove documents for files that no longer exist
    const removedPaths = existingDocs
      .filter(d => !scannedPaths.has(d.filePath))
      .map(d => d.filePath);
    if (removedPaths.length > 0) {
      this.storage.deleteDocumentsByPaths(repoId, removedPaths);
    }

    return { added, updated, removed: removedPaths.length };
  }

  listDocs(repoId: string, docType?: DocType): RepoDocument[] {
    return this.storage.listDocuments(repoId, docType);
  }

  getDoc(docId: string): RepoDocument | null {
    return this.storage.getDocument(docId);
  }

  getDocContent(repoId: string, docId: string, repoPath: string): string | null {
    const doc = this.storage.getDocument(docId);
    if (!doc || doc.repoId !== repoId) return null;
    const fullPath = path.join(repoPath, doc.filePath);
    try {
      return fs.readFileSync(fullPath, 'utf-8');
    } catch {
      return null;
    }
  }

  getDocReferences(repoId: string, docId: string, repoPath: string): string[] {
    const content = this.getDocContent(repoId, docId, repoPath);
    if (!content) return [];

    // Extract file path references from markdown (backtick code references, links)
    const references = new Set<string>();

    // Match backtick file paths like `src/server/httpServer.ts`
    const backtickRegex = /`([a-zA-Z0-9_\-./]+\.[a-zA-Z]{1,10})`/g;
    let match;
    while ((match = backtickRegex.exec(content)) !== null) {
      const ref = match[1];
      if (ref.includes('/') && !ref.startsWith('http')) {
        references.add(ref);
      }
    }

    // Match markdown links to local files [text](path/to/file.ts)
    const linkRegex = /\]\(([a-zA-Z0-9_\-./]+\.[a-zA-Z]{1,10})\)/g;
    while ((match = linkRegex.exec(content)) !== null) {
      const ref = match[1];
      if (!ref.startsWith('http')) {
        references.add(ref);
      }
    }

    // Cross-reference with graph nodes
    const graphNodes = this.storage.listGraphNodes(repoId);
    const graphPaths = new Set(graphNodes.map(n => n.filePath));
    return [...references].filter(ref => graphPaths.has(ref));
  }
}
