export class DILError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = 'DILError';
  }
}

export class RepoNotFoundError extends DILError {
  constructor(identifier: string) {
    super(`Repository not found: ${identifier}`, 'REPO_NOT_FOUND', 404);
    this.name = 'RepoNotFoundError';
  }
}

export class RepoNotReadyError extends DILError {
  constructor(repoId: string, status: string) {
    super(
      `Repository ${repoId} is not ready (status: ${status})`,
      'REPO_NOT_READY',
      409,
    );
    this.name = 'RepoNotReadyError';
  }
}

export class RepoAlreadyExistsError extends DILError {
  constructor(repoPath: string) {
    super(`Repository already registered: ${repoPath}`, 'REPO_ALREADY_EXISTS', 409);
    this.name = 'RepoAlreadyExistsError';
  }
}

export class NotAGitRepoError extends DILError {
  constructor(path: string) {
    super(`Not a git repository: ${path}`, 'NOT_A_GIT_REPO', 400);
    this.name = 'NotAGitRepoError';
  }
}

export class RuleNotFoundError extends DILError {
  constructor(ruleId: string) {
    super(`Rule not found: ${ruleId}`, 'RULE_NOT_FOUND', 404);
    this.name = 'RuleNotFoundError';
  }
}

export class ManifestNotFoundError extends DILError {
  constructor(repoId: string) {
    super(`Manifest not found for repo: ${repoId}`, 'MANIFEST_NOT_FOUND', 404);
    this.name = 'ManifestNotFoundError';
  }
}

export class LSPServerNotAvailableError extends DILError {
  constructor(serverId: string, installHint: string) {
    super(
      `Language server "${serverId}" not available. Install with: ${installHint}`,
      'LSP_NOT_AVAILABLE',
      424,
    );
    this.name = 'LSPServerNotAvailableError';
  }
}

export class StorageError extends DILError {
  constructor(message: string) {
    super(message, 'STORAGE_ERROR', 500);
    this.name = 'StorageError';
  }
}

export class ConfigError extends DILError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR', 500);
    this.name = 'ConfigError';
  }
}
