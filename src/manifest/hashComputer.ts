import crypto from 'node:crypto';

export function computeStagedHash(stagedFiles: string[], diffContent: string): string {
  const sorted = [...stagedFiles].sort();
  const payload = sorted.join('\n') + '\n---\n' + diffContent;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}
