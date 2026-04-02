import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from 'vscode-jsonrpc/node.js';
import type { ChildProcess } from 'node:child_process';
import type { DocumentSymbol, Location, LocationLink } from 'vscode-languageserver-protocol';

export function createLSPConnection(childProc: ChildProcess): MessageConnection {
  if (!childProc.stdout || !childProc.stdin) {
    throw new Error('LSP process must have stdio streams');
  }
  const reader = new StreamMessageReader(childProc.stdout);
  const writer = new StreamMessageWriter(childProc.stdin);
  const connection = createMessageConnection(reader, writer);
  connection.listen();
  return connection;
}

export async function initializeLSP(
  connection: MessageConnection,
  rootUri: string,
  initializationOptions?: Record<string, unknown>,
): Promise<unknown> {
  const params = {
    processId: process.pid ?? null,
    rootUri,
    capabilities: {
      textDocument: {
        documentSymbol: { hierarchicalDocumentSymbolSupport: true },
        definition: { linkSupport: true },
        references: {},
        callHierarchy: {},
      },
      workspace: {
        symbol: { dynamicRegistration: false },
      },
    },
    initializationOptions,
  };

  const result = await connection.sendRequest('initialize', params);
  await connection.sendNotification('initialized', {});
  return result;
}

export async function shutdownLSP(connection: MessageConnection): Promise<void> {
  await connection.sendRequest('shutdown');
  await connection.sendNotification('exit');
}

export async function getDocumentSymbols(
  connection: MessageConnection,
  fileUri: string,
): Promise<DocumentSymbol[]> {
  const result = await connection.sendRequest('textDocument/documentSymbol', {
    textDocument: { uri: fileUri },
  });
  if (!result) return [];
  return result as DocumentSymbol[];
}

export async function getDefinition(
  connection: MessageConnection,
  fileUri: string,
  line: number,
  character: number,
): Promise<(Location | LocationLink)[]> {
  const result = await connection.sendRequest('textDocument/definition', {
    textDocument: { uri: fileUri },
    position: { line, character },
  });
  if (!result) return [];
  return Array.isArray(result) ? result as (Location | LocationLink)[] : [result as Location | LocationLink];
}

export async function getReferences(
  connection: MessageConnection,
  fileUri: string,
  line: number,
  character: number,
): Promise<Location[]> {
  const result = await connection.sendRequest('textDocument/references', {
    textDocument: { uri: fileUri },
    position: { line, character },
    context: { includeDeclaration: false },
  });
  return (result as Location[] | null) ?? [];
}

export function filePathToUri(filePath: string): string {
  if (filePath.startsWith('file://')) return filePath;
  return `file://${filePath}`;
}

export function uriToFilePath(uri: string): string {
  if (uri.startsWith('file://')) return uri.slice(7);
  return uri;
}
