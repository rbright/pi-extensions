/* oxlint-disable no-magic-numbers, sort-keys */

import { describe, expect, it } from 'vitest';

import { summarizeAssistantMessage, summarizeLastAssistantMessage } from '../summary';

describe('summarizeAssistantMessage', () => {
  it('summarizes string content from assistant messages', () => {
    expect(
      summarizeAssistantMessage({
        role: 'assistant',
        content: 'Updated the platform deployment docs. Run `just lint` next.',
      }),
    ).toBe('Updated the platform deployment docs.');
  });

  it('summarizes text parts from array content', () => {
    expect(
      summarizeAssistantMessage({
        role: 'assistant',
        content: [
          { type: 'text', text: 'Implemented the notification title resolver.' },
          { type: 'tool_use', name: 'bash' },
        ],
      }),
    ).toBe('Implemented the notification title resolver.');
  });

  it('returns undefined when no text exists', () => {
    expect(summarizeAssistantMessage({ role: 'assistant', content: [{ type: 'tool_use' }] })).toBeUndefined();
  });
});

describe('summarizeLastAssistantMessage', () => {
  it('uses the most recent assistant message', () => {
    expect(
      summarizeLastAssistantMessage([
        { role: 'assistant', content: 'Older summary.' },
        { role: 'user', content: 'Thanks' },
        { role: 'assistant', content: [{ text: 'Newest summary is here.' }] },
      ]),
    ).toBe('Newest summary is here.');
  });

  it('returns undefined for non-array payloads', () => {
    expect(summarizeLastAssistantMessage({ role: 'assistant', content: 'Nope' })).toBeUndefined();
  });
});
