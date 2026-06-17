import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyProviderPayload,
  buildCacheKeys,
  buildHeaderOverrides,
  canonicalRepoStringFromLocal,
  canonicalRepoStringFromRemote,
} from './cache-keys';
import registerProviderCacheKeys, {
  DEFAULT_CONFIG,
  affinitySuffixForSubagent,
  deriveRepoState,
  inferProviderFromPayload,
  loadConfig,
} from './index';

type ExtensionAPILike = {
  on: (eventName: string, handler: unknown) => void;
};

const setupExtension = () => {
  const handlers = new Map<string, (event: unknown, ctx: unknown) => Promise<unknown> | unknown>();
  const on = vi.fn((eventName: string, callback: (event: unknown, ctx: unknown) => Promise<unknown> | unknown) => {
    handlers.set(eventName, callback);
  });

  registerProviderCacheKeys({ on } as ExtensionAPILike);
  return { handlers, on };
};

describe('provider cache key helpers', () => {
  it('normalizes GitHub HTTPS and SSH remotes to the same canonical repo string', () => {
    const https = canonicalRepoStringFromRemote('https://github.com/Moonrise-Labs/Platform.git');
    const ssh = canonicalRepoStringFromRemote('git@github.com:moonrise-labs/platform.git');

    expect(https).toBe('repo:v1|remote:github.com/moonrise-labs/platform');
    expect(https).toBe(ssh);
  });

  it('keeps local fallback identity stable', () => {
    expect(canonicalRepoStringFromLocal('/Users/ryan/dev/local-only-repo')).toBe(
      'repo:v1|local:/Users/ryan/dev/local-only-repo',
    );
  });

  it('builds repo-level isolation keys plus optional worktree and retrieval affinity suffixes', () => {
    const repo = buildCacheKeys('repo:v1|remote:github.com/moonrise-labs/platform', 'repo');
    const worktree = buildCacheKeys(
      'repo:v1|remote:github.com/moonrise-labs/platform',
      'worktree',
      'feature/cache',
      'wt',
    );
    const retrieval = buildCacheKeys(
      'repo:v1|remote:github.com/moonrise-labs/platform',
      'repo',
      null,
      null,
      'retrieval:linear',
    );
    const other = buildCacheKeys('repo:v1|remote:github.com/moonrise-labs/other', 'repo');

    expect(repo.cacheAffinityKey).toBe(repo.cacheIsolationKey.replace(':iso:', ':aff:'));
    expect(worktree.cacheIsolationKey).toBe(repo.cacheIsolationKey);
    expect(worktree.cacheAffinityKey).not.toBe(repo.cacheAffinityKey);
    expect(retrieval.cacheIsolationKey).toBe(repo.cacheIsolationKey);
    expect(retrieval.cacheAffinityKey).toBe(`${repo.cacheAffinityKey}:retrieval:linear`);
    expect(other.repoHash).not.toBe(repo.repoHash);
  });

  it('injects provider-specific payload fields only for OpenRouter and Fireworks', () => {
    const keys = buildCacheKeys('repo:v1|remote:github.com/moonrise-labs/platform', 'repo');

    expect(applyProviderPayload('openrouter', { model: 'x', prompt_cache_key: 'old' }, keys)).toEqual({
      model: 'x',
      prompt_cache_key: keys.cacheAffinityKey,
      session_id: keys.cacheAffinityKey,
    });
    expect(applyProviderPayload('fireworks', { model: 'x' }, keys)).toEqual({
      model: 'x',
      prompt_cache_key: keys.cacheAffinityKey,
      prompt_cache_isolation_key: keys.cacheIsolationKey,
      perf_metrics_in_response: true,
    });
    expect(applyProviderPayload('openai', { model: 'x' }, keys)).toEqual({ model: 'x' });
  });

  it('only overrides Fireworks session-affinity headers', () => {
    const key = 'pi:aff:v1:r:abcd1234abcd1234';
    expect(buildHeaderOverrides('openrouter', key)).toEqual({});
    expect(buildHeaderOverrides('fireworks', key)).toEqual({ 'x-session-affinity': key });
  });
});

describe('provider cache key extension', () => {
  afterEach(() => {
    delete process.env.PI_PROVIDER_CACHE_KEYS_CONFIG;
    delete process.env.PI_SUBAGENT_NAME;
  });

  it('registers request, payload, response, and message hooks', () => {
    const { on } = setupExtension();

    expect(on).toHaveBeenCalledWith('before_provider_request', expect.any(Function));
    expect(on).toHaveBeenCalledWith('before_provider_payload', expect.any(Function));
    expect(on).toHaveBeenCalledWith('after_provider_response', expect.any(Function));
    expect(on).toHaveBeenCalledWith('message_end', expect.any(Function));
  });

  it('infers provider names from legacy provider payloads', () => {
    expect(inferProviderFromPayload({ model: 'moonshotai/kimi-k2.7-code' })).toBe('openrouter');
    expect(inferProviderFromPayload({ model: 'accounts/fireworks/models/kimi-k2p7-code' })).toBe('fireworks');
    expect(inferProviderFromPayload({ model: 'gpt-5.5' })).toBeNull();
  });

  it('falls back to defaults when config is missing', () => {
    expect(loadConfig('/tmp/this-file-does-not-exist.json')).toEqual(DEFAULT_CONFIG);
  });

  it('supports the current legacy before_provider_request payload wrapper without throwing', () => {
    const { handlers } = setupExtension();
    const beforeRequest = handlers.get('before_provider_request');

    const nextPayload = beforeRequest?.(
      {
        type: 'before_provider_request',
        payload: { model: 'moonshotai/kimi-k2.7-code' },
      },
      { cwd: process.cwd() },
    ) as Record<string, string>;

    expect(nextPayload.session_id).toMatch(/^pi:aff:v1:r:/);
  });

  it('ignores provider-request events that do not expose enough metadata', () => {
    const { handlers } = setupExtension();
    const beforeRequest = handlers.get('before_provider_request');

    expect(() =>
      beforeRequest?.({ type: 'before_provider_request', payload: {} }, { cwd: process.cwd() }),
    ).not.toThrow();
    expect(beforeRequest?.({ type: 'before_provider_request', payload: {} }, { cwd: process.cwd() })).toBeUndefined();
  });

  it('keeps parent and reviewer affinity repo-derived even with different Pi session ids', () => {
    const { handlers } = setupExtension();
    const beforePayload = handlers.get('before_provider_payload');
    const ctx = { cwd: process.cwd() };

    delete process.env.PI_SUBAGENT_NAME;
    const parentPayload = beforePayload?.(
      {
        model: { provider: 'openrouter' },
        payload: { model: 'moonshotai/kimi-k2.7-code' },
      },
      ctx,
    ) as { payload: Record<string, string> };

    process.env.PI_SUBAGENT_NAME = 'reviewer';
    const reviewerPayload = beforePayload?.(
      {
        model: { provider: 'openrouter' },
        payload: { model: 'moonshotai/kimi-k2.7-code' },
      },
      ctx,
    ) as { payload: Record<string, string> };

    expect(parentPayload.payload.session_id).toBe(reviewerPayload.payload.session_id);
  });

  it('uses source-specific affinity for retrieval agents while keeping isolation repo-derived', () => {
    const { handlers } = setupExtension();
    const beforePayload = handlers.get('before_provider_payload');
    const ctx = { cwd: process.cwd() };

    process.env.PI_SUBAGENT_NAME = 'linear';
    const payload = beforePayload?.(
      {
        model: { provider: 'fireworks' },
        payload: { model: 'accounts/fireworks/models/kimi-k2p7-code' },
      },
      ctx,
    ) as { payload: Record<string, string> };
    const repoState = deriveRepoState(process.cwd(), 'repo');

    expect(affinitySuffixForSubagent('linear')).toBe('retrieval:linear');
    expect(payload.payload.prompt_cache_isolation_key).toBe(repoState.cacheIsolationKey);
    expect(payload.payload.prompt_cache_key).toBe(`${repoState.cacheAffinityKey}:retrieval:linear`);
  });

  it('does not log raw provider error text', () => {
    const { handlers } = setupExtension();
    const beforeRequest = handlers.get('before_provider_request');
    const afterResponse = handlers.get('after_provider_response');
    const messageEnd = handlers.get('message_end');
    const tempDir = mkdtempSync(join(tmpdir(), 'provider-cache-keys-'));
    const configPath = join(tempDir, 'provider-cache-keys.json');
    const logPath = join(tempDir, 'provider-cache-keys.jsonl');
    writeFileSync(configPath, JSON.stringify({ enabled: true, affinityScope: 'repo', logFile: logPath }), 'utf8');
    process.env.PI_PROVIDER_CACHE_KEYS_CONFIG = configPath;

    beforeRequest?.(
      {
        model: { provider: 'openrouter', id: 'moonshotai/kimi-k2.7-code' },
        sessionId: 'root-session',
        streamOptions: { headers: {} },
      },
      { cwd: process.cwd() },
    );
    afterResponse?.({ status: 500 }, {});
    messageEnd?.(
      {
        message: {
          role: 'assistant',
          provider: 'openrouter',
          model: 'moonshotai/kimi-k2.7-code',
          stopReason: 'error',
          errorMessage: 'secret token leaked',
        },
      },
      {},
    );

    const log = readFileSync(logPath, 'utf8');
    expect(log).toContain('"error_status":500');
    expect(log).not.toContain('secret token leaked');
  });

  it('derives repo state from the current repo without throwing', () => {
    const state = deriveRepoState(process.cwd(), 'repo');
    expect(state.repoHash).toMatch(/^[0-9a-f]{16}$/);
    expect(state.cacheAffinityKey).toMatch(/^pi:aff:v1:r:/);
    expect(state.cacheIsolationKey).toMatch(/^pi:iso:v1:r:/);
  });
});
