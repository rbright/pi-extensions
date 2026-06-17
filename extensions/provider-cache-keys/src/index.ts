import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import {
  applyProviderPayload,
  buildCacheKeys,
  canonicalRepoStringFromLocal,
  canonicalRepoStringFromRemote,
  type CacheConfig,
  type CacheKeys,
  normalizeLocalPath,
} from './cache-keys';

export interface DerivedRepoState extends CacheKeys {
  canonicalRepo: string;
}

const RETRIEVAL_AFFINITY_SUFFIX_BY_SUBAGENT: Record<string, string> = {
  datadog: 'retrieval:datadog',
  linear: 'retrieval:linear',
  sentry: 'retrieval:sentry',
  todoist: 'retrieval:todoist',
  web: 'retrieval:web',
  'web-researcher': 'retrieval:web',
};

const OPENROUTER_MODEL_PREFIXES = [
  'anthropic/',
  'deepseek/',
  'google/',
  'meta-llama/',
  'minimax/',
  'moonshotai/',
  'openai/',
  'qwen/',
  'z-ai/',
];

interface ExtensionAPILike {
  on: (eventName: string, handler: unknown) => void;
}

interface BeforeProviderRequestEventLike {
  type?: string;
  payload?: unknown;
  model?: { provider?: string; id?: string };
  sessionId?: string;
  streamOptions?: { headers?: Record<string, string> };
}

interface BeforeProviderPayloadEventLike {
  model?: { provider?: string };
  payload: unknown;
}

interface AfterProviderResponseEventLike {
  status: number;
}

interface AssistantMessageLike {
  role?: unknown;
  provider?: unknown;
  model?: unknown;
  usage?: {
    input?: number;
    cacheRead?: number;
    cacheWrite?: number;
    output?: number;
    cost?: { total?: number };
  };
  stopReason?: unknown;
  errorMessage?: unknown;
}

interface ExtensionContextLike {
  cwd: string;
}

interface PendingRequest {
  provider: string;
  model: string;
  repoHash: string;
  cacheAffinityKey: string;
  cacheIsolationKey: string;
  piSessionId: string;
  subagentName: string | null;
  startedAt: number;
  responseStatus: number | null;
}

export const DEFAULT_CONFIG_PATH = join(homedir(), '.pi', 'agent', 'provider-cache-keys.json');
export const DEFAULT_CONFIG: CacheConfig = {
  enabled: true,
  affinityScope: 'repo',
  logFile: '~/.pi/agent/logs/provider-cache-keys.jsonl',
};

const repoStateCache = new Map<string, DerivedRepoState>();

function expandHomePath(value: string): string {
  if (value === '~') return homedir();
  if (value.startsWith('~/')) return join(homedir(), value.slice(2));
  return value;
}

export function getConfigPath(): string {
  return process.env.PI_PROVIDER_CACHE_KEYS_CONFIG || DEFAULT_CONFIG_PATH;
}

export function loadConfig(configPath = getConfigPath()): CacheConfig {
  if (!existsSync(configPath)) return DEFAULT_CONFIG;

  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf8')) as Partial<CacheConfig>;
    return {
      enabled: raw.enabled ?? DEFAULT_CONFIG.enabled,
      affinityScope: raw.affinityScope === 'worktree' ? 'worktree' : 'repo',
      logFile: raw.logFile ?? DEFAULT_CONFIG.logFile,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function runGit(cwd: string, ...args: string[]): string | null {
  try {
    return (
      execFileSync('git', ['-C', cwd, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 1500,
      }).trim() || null
    );
  } catch {
    return null;
  }
}

export function affinitySuffixForSubagent(subagentName: string | null): string | null {
  if (!subagentName) return null;
  return RETRIEVAL_AFFINITY_SUFFIX_BY_SUBAGENT[subagentName] ?? null;
}

export function deriveRepoState(
  cwd: string,
  affinityScope: CacheConfig['affinityScope'],
  affinitySuffix?: string | null,
): DerivedRepoState {
  const cacheKey = `${normalizeLocalPath(cwd)}|${affinityScope}|${affinitySuffix ?? ''}`;
  const cached = repoStateCache.get(cacheKey);
  if (cached) return cached;

  const remoteUrl = runGit(cwd, 'remote', 'get-url', 'origin');
  const repoRoot = runGit(cwd, 'rev-parse', '--show-toplevel') || cwd;
  const stableRepoRoot = existsSync(repoRoot) ? realpathSync(repoRoot) : repoRoot;
  const canonicalRepo = remoteUrl
    ? canonicalRepoStringFromRemote(remoteUrl) || canonicalRepoStringFromLocal(stableRepoRoot)
    : canonicalRepoStringFromLocal(stableRepoRoot);
  const branchName = affinityScope === 'worktree' ? runGit(cwd, 'rev-parse', '--abbrev-ref', 'HEAD') : null;
  const normalizedCwd = normalizeLocalPath(cwd);
  const normalizedRoot = normalizeLocalPath(stableRepoRoot);
  const worktreeName =
    affinityScope === 'worktree' && normalizedCwd !== normalizedRoot ? basename(normalizedCwd) : null;
  const derived = {
    canonicalRepo,
    ...buildCacheKeys(canonicalRepo, affinityScope, branchName, worktreeName, affinitySuffix),
  };

  repoStateCache.set(cacheKey, derived);
  return derived;
}

function currentSubagentName(): string | null {
  return process.env.PI_SUBAGENT_NAME || null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function inferModelIdFromPayload(payload: unknown): string | null {
  if (!isPlainObject(payload) || typeof payload.model !== 'string') return null;
  return payload.model;
}

export function inferProviderFromPayload(payload: unknown): string | null {
  if (!isPlainObject(payload)) return null;
  if (typeof payload.provider === 'string') return payload.provider;
  if (typeof payload.model !== 'string') return null;
  const modelId = payload.model;
  return OPENROUTER_MODEL_PREFIXES.some((prefix) => modelId.startsWith(prefix)) ? 'openrouter' : null;
}

function writeLog(config: CacheConfig, record: Record<string, unknown>): void {
  const logPath = expandHomePath(config.logFile);
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify(record)}\n`, 'utf8');
}

export function registerProviderCacheKeys(pi: ExtensionAPILike): void {
  const pendingRequests: PendingRequest[] = [];

  pi.on('before_provider_request', (event: BeforeProviderRequestEventLike, ctx: ExtensionContextLike) => {
    const config = loadConfig();
    if (!config.enabled) return;

    const payload = Object.prototype.hasOwnProperty.call(event, 'payload') ? event.payload : undefined;
    const provider = event.model?.provider ?? inferProviderFromPayload(payload);
    if (!provider) return;

    const subagentName = currentSubagentName();
    const repo = deriveRepoState(ctx.cwd, config.affinityScope, affinitySuffixForSubagent(subagentName));
    const modelId = event.model?.id ?? inferModelIdFromPayload(payload);
    if (modelId && typeof event.sessionId === 'string') {
      pendingRequests.push({
        provider,
        model: modelId,
        repoHash: repo.repoHash,
        cacheAffinityKey: repo.cacheAffinityKey,
        cacheIsolationKey: repo.cacheIsolationKey,
        piSessionId: event.sessionId,
        subagentName,
        startedAt: Date.now(),
        responseStatus: null,
      });
    }

    if (Object.prototype.hasOwnProperty.call(event, 'payload')) {
      return applyProviderPayload(provider, payload, repo);
    }
  });

  pi.on('before_provider_payload', (event: BeforeProviderPayloadEventLike, ctx: ExtensionContextLike) => {
    const config = loadConfig();
    if (!config.enabled) return { payload: event.payload };

    const provider = event.model?.provider ?? inferProviderFromPayload(event.payload);
    if (!provider) return { payload: event.payload };

    const repo = deriveRepoState(ctx.cwd, config.affinityScope, affinitySuffixForSubagent(currentSubagentName()));
    return {
      payload: applyProviderPayload(provider, event.payload, repo),
    };
  });

  pi.on('after_provider_response', (event: AfterProviderResponseEventLike) => {
    const pending = [...pendingRequests].reverse().find((entry) => entry.responseStatus === null);
    if (pending) {
      pending.responseStatus = event.status;
    }
  });

  pi.on('message_end', (event: { message: AssistantMessageLike }) => {
    const config = loadConfig();
    if (!config.enabled) return;
    if (event.message.role !== 'assistant') return;
    if (typeof event.message.provider !== 'string' || typeof event.message.model !== 'string') return;

    const pendingIndex = pendingRequests.findIndex(
      (entry) => entry.provider === event.message.provider && entry.model === event.message.model,
    );
    if (pendingIndex === -1) return;

    const [pending] = pendingRequests.splice(pendingIndex, 1);
    const usage = event.message.usage;
    const errorStatus =
      event.message.stopReason === 'error'
        ? (pending.responseStatus ?? 'error')
        : pending.responseStatus && pending.responseStatus >= 400
          ? pending.responseStatus
          : null;

    writeLog(config, {
      timestamp: new Date().toISOString(),
      provider: event.message.provider,
      model: event.message.model,
      repo_hash: pending.repoHash,
      cache_affinity_key: pending.cacheAffinityKey,
      cache_isolation_key: pending.cacheIsolationKey,
      pi_session_id: pending.piSessionId,
      subagent_name: pending.subagentName,
      prompt_tokens: usage?.input ?? null,
      cached_tokens: usage?.cacheRead ?? null,
      cache_write_tokens: usage?.cacheWrite ?? null,
      completion_tokens: usage?.output ?? null,
      total_cost: usage?.cost?.total ?? null,
      latency_ms: Date.now() - pending.startedAt,
      error_status: errorStatus,
    });
  });
}

export default registerProviderCacheKeys;
