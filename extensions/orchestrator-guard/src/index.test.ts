import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it, vi } from 'vitest';

import registerOrchestratorGuard, {
  appendWorkflowGuidance,
  DEFAULT_CONFIG,
  isSubagentSession,
  loadConfig,
  ROOT_WORKFLOW_GUIDANCE,
  shouldBlockTool,
  shouldInjectWorkflowGuidance,
} from './index';

const setupExtension = () => {
  const handlers = new Map<string, (event: unknown, ctx: unknown) => Promise<unknown>>();
  const on = vi.fn((eventName: string, callback: (event: unknown, ctx: unknown) => Promise<unknown>) => {
    handlers.set(eventName, callback);
  });

  registerOrchestratorGuard({ on } as unknown as ExtensionAPI);

  return { handlers, on };
};

describe('orchestrator guard extension', () => {
  afterEach(() => {
    delete process.env.PI_ORCHESTRATOR_GUARD_CONFIG;
    delete process.env.PI_ORCHESTRATOR_GUARD_DISABLED;
  });

  it('registers tool blocking and workflow guidance hooks', () => {
    const { on } = setupExtension();

    expect(on).toHaveBeenCalledWith('before_agent_start', expect.any(Function));
    expect(on).toHaveBeenCalledWith('tool_call', expect.any(Function));
  });

  it('injects root-only workflow guidance before the agent starts', async () => {
    process.env.PI_ORCHESTRATOR_GUARD_CONFIG = '/tmp/this-file-does-not-exist.json';
    const { handlers } = setupExtension();

    const result = await handlers.get('before_agent_start')?.(
      { systemPrompt: 'Base prompt', type: 'before_agent_start' },
      { sessionManager: { getSessionFile: () => '/home/me/.pi/agent/sessions/project/abc.jsonl' } },
    );

    expect(result).toEqual({ systemPrompt: appendWorkflowGuidance('Base prompt') });
  });

  it('keeps hard root tool blocking unchanged', async () => {
    process.env.PI_ORCHESTRATOR_GUARD_CONFIG = '/tmp/this-file-does-not-exist.json';
    const notify = vi.fn();
    const { handlers } = setupExtension();

    const result = await handlers.get('tool_call')?.(
      { toolName: 'bash', type: 'tool_call' },
      { sessionManager: { getSessionFile: () => '/home/me/.pi/agent/sessions/project/abc.jsonl' }, ui: { notify } },
    );

    expect(result).toEqual({
      block: true,
      reason:
        'Orchestrator guard: delegate bash to a subagent or chain; the root session is for clarification, routing, and summaries.',
    });
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('delegate bash'), 'warning');
  });

  it('does not inject workflow guidance for subagents', async () => {
    process.env.PI_ORCHESTRATOR_GUARD_CONFIG = '/tmp/this-file-does-not-exist.json';
    const { handlers } = setupExtension();

    const result = await handlers.get('before_agent_start')?.(
      { systemPrompt: 'Base prompt', type: 'before_agent_start' },
      { sessionManager: { getSessionFile: () => '/home/me/.pi/agent/sessions/subagent/abc.jsonl' } },
    );

    expect(result).toBeUndefined();
  });
});

describe('orchestrator guard helpers', () => {
  it('detects subagent session paths', () => {
    expect(isSubagentSession('/home/me/.pi/agent/sessions/subagent/abc.jsonl', DEFAULT_CONFIG)).toBe(true);
    expect(isSubagentSession('/home/me/.pi/agent/sessions/project/abc.jsonl', DEFAULT_CONFIG)).toBe(false);
    expect(isSubagentSession(undefined, DEFAULT_CONFIG)).toBe(false);
  });

  it('blocks root direct implementation tools by default', () => {
    expect(shouldBlockTool('bash', DEFAULT_CONFIG, '/home/me/.pi/agent/sessions/project/abc.jsonl')).toBe(true);
  });

  it('does not block subagent sessions', () => {
    expect(shouldBlockTool('bash', DEFAULT_CONFIG, '/home/me/.pi/agent/sessions/subagent/abc.jsonl')).toBe(false);
  });

  it('injects guidance for root sessions only', () => {
    expect(shouldInjectWorkflowGuidance(DEFAULT_CONFIG, '/home/me/.pi/agent/sessions/project/abc.jsonl')).toBe(true);
    expect(shouldInjectWorkflowGuidance(DEFAULT_CONFIG, '/home/me/.pi/agent/sessions/subagent/abc.jsonl')).toBe(false);
  });

  it('appends root workflow guidance once', () => {
    const guidedPrompt = appendWorkflowGuidance('Base prompt');

    expect(guidedPrompt).toContain(ROOT_WORKFLOW_GUIDANCE);
    expect(appendWorkflowGuidance(guidedPrompt)).toBe(guidedPrompt);
  });

  it('falls back to defaults when config is missing', () => {
    expect(loadConfig('/tmp/this-file-does-not-exist.json')).toEqual(DEFAULT_CONFIG);
  });
});
