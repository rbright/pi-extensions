import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG, isSubagentSession, loadConfig, shouldBlockTool } from './index';

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

  it('falls back to defaults when config is missing', () => {
    expect(loadConfig('/tmp/this-file-does-not-exist.json')).toEqual(DEFAULT_CONFIG);
  });
});
