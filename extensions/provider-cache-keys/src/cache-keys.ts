import { createHash } from 'node:crypto';
import path from 'node:path';

export type AffinityScope = 'repo' | 'worktree';

export interface CacheConfig {
  enabled: boolean;
  affinityScope: AffinityScope;
  logFile: string;
}

export interface CacheKeys {
  repoHash: string;
  cacheIsolationKey: string;
  cacheAffinityKey: string;
}

const CASE_INSENSITIVE_REPO_HOSTS = new Set([
  'github.com',
  'www.github.com',
  'gitlab.com',
  'www.gitlab.com',
  'bitbucket.org',
  'www.bitbucket.org',
]);

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function shortHash(value: string): string {
  return sha256Hex(value).slice(0, 16);
}

export function normalizeLocalPath(value: string): string {
  const resolved = path.resolve(value).replace(/\\/g, '/');
  return resolved.replace(/^([A-Z]):/, (_, drive: string) => `${drive.toLowerCase()}:`);
}

export function canonicalizeRemoteUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  let host = '';
  let repoPath = '';
  const scpLike = !trimmed.includes('://') ? trimmed.match(/^(?:[^@/\s]+@)?([^:/\s]+):(.+)$/) : null;

  if (scpLike) {
    host = scpLike[1] ?? '';
    repoPath = scpLike[2] ?? '';
  } else {
    let parsed: URL;
    try {
      parsed = new URL(trimmed.replace(/^git\+/, ''));
    } catch {
      return null;
    }
    if (parsed.protocol === 'file:') return null;
    host = parsed.hostname;
    repoPath = parsed.pathname.replace(/^\/+/, '');
  }

  host = host.toLowerCase();
  repoPath = repoPath.replace(/\/+$/, '').replace(/\.git$/i, '');
  if (!host || !repoPath) return null;

  if (CASE_INSENSITIVE_REPO_HOSTS.has(host)) {
    repoPath = repoPath.toLowerCase();
  }

  return `${host}/${repoPath}`;
}

export function canonicalRepoStringFromRemote(rawUrl: string): string | null {
  const canonicalRemote = canonicalizeRemoteUrl(rawUrl);
  return canonicalRemote ? `repo:v1|remote:${canonicalRemote}` : null;
}

export function canonicalRepoStringFromLocal(repoRoot: string): string {
  return `repo:v1|local:${normalizeLocalPath(repoRoot)}`;
}

export function buildCacheKeys(
  canonicalRepo: string,
  affinityScope: AffinityScope,
  branchName?: string | null,
  worktreeName?: string | null,
  affinitySuffix?: string | null,
): CacheKeys {
  const repoHash = shortHash(canonicalRepo);
  const cacheIsolationKey = `pi:iso:v1:r:${repoHash}`;
  let cacheAffinityKey = `pi:aff:v1:r:${repoHash}`;

  if (affinityScope === 'worktree') {
    const worktreeSeed = [
      canonicalRepo,
      `branch:${branchName || 'detached'}`,
      worktreeName ? `worktree:${worktreeName}` : null,
    ]
      .filter(Boolean)
      .join('|');
    cacheAffinityKey = `${cacheAffinityKey}:w:${shortHash(worktreeSeed)}`;
  }

  if (affinitySuffix) {
    cacheAffinityKey = `${cacheAffinityKey}:${affinitySuffix.replace(/^:+/, '')}`;
  }

  return { repoHash, cacheIsolationKey, cacheAffinityKey };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function applyProviderPayload(
  provider: string,
  payload: unknown,
  keys: Pick<CacheKeys, 'cacheAffinityKey' | 'cacheIsolationKey'>,
): unknown {
  if (!isPlainObject(payload)) return payload;

  const next = { ...payload };

  if (provider === 'openrouter') {
    next.session_id = keys.cacheAffinityKey;
    return next;
  }

  return payload;
}
