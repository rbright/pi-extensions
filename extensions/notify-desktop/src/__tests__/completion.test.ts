/* oxlint-disable func-style, init-declarations, no-magic-numbers */

import { describe, expect, it, vi } from 'vitest';

import {
  createTurnCompletionTracker,
  registerTurnCompletionHooks,
  shouldNotifyFromAssistantMessage,
} from '../completion';
import type { CompletionEventAPI, MessageEndLikeEvent } from '../completion';

function createDeferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;

  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

describe('shouldNotifyFromAssistantMessage', () => {
  it('returns true for assistant completion messages', () => {
    expect(shouldNotifyFromAssistantMessage({ role: 'assistant', stopReason: 'stop' })).toBe(true);
    expect(shouldNotifyFromAssistantMessage({ role: 'assistant' })).toBe(true);
  });

  it('returns false for non-assistant messages', () => {
    expect(shouldNotifyFromAssistantMessage({ role: 'user', stopReason: 'stop' })).toBe(false);
  });

  it('returns false for excluded stop reasons', () => {
    expect(shouldNotifyFromAssistantMessage({ role: 'assistant', stopReason: 'toolUse' })).toBe(false);
    expect(shouldNotifyFromAssistantMessage({ role: 'assistant', stopReason: 'error' })).toBe(false);
    expect(shouldNotifyFromAssistantMessage({ role: 'assistant', stopReason: 'aborted' })).toBe(false);
  });
});

describe('createTurnCompletionTracker', () => {
  it('dedupes message_end and agent_end notifications in a single run', async () => {
    const onTurnComplete = vi.fn();
    const tracker = createTurnCompletionTracker(onTurnComplete);

    tracker.onAgentStart();
    await tracker.onMessageEnd({ message: { role: 'assistant', stopReason: 'stop' } });
    await tracker.onAgentEnd();

    expect(onTurnComplete).toHaveBeenCalledTimes(1);
  });

  it('resets dedupe state on agent_start', async () => {
    const onTurnComplete = vi.fn();
    const tracker = createTurnCompletionTracker(onTurnComplete);

    tracker.onAgentStart();
    await tracker.onAgentEnd();

    tracker.onAgentStart();
    await tracker.onAgentEnd();

    expect(onTurnComplete).toHaveBeenCalledTimes(2);
  });

  it('uses agent_end as fallback for tool-use turns', async () => {
    const onTurnComplete = vi.fn();
    const tracker = createTurnCompletionTracker(onTurnComplete);

    tracker.onAgentStart();
    await tracker.onMessageEnd({ message: { role: 'assistant', stopReason: 'toolUse' } });
    await tracker.onAgentEnd();

    expect(onTurnComplete).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent triggers while notify callback is in flight', async () => {
    const deferred = createDeferred();
    const onTurnComplete = vi.fn(async () => {
      await deferred.promise;
    });
    const tracker = createTurnCompletionTracker(onTurnComplete);

    tracker.onAgentStart();
    const messageEnd = tracker.onMessageEnd({ message: { role: 'assistant', stopReason: 'stop' } });
    const agentEnd = tracker.onAgentEnd();

    expect(onTurnComplete).toHaveBeenCalledTimes(1);

    deferred.resolve();
    await Promise.all([messageEnd, agentEnd]);
  });

  it('allows retry when notify callback fails', async () => {
    const onTurnComplete = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce();

    const tracker = createTurnCompletionTracker(onTurnComplete);

    tracker.onAgentStart();
    await expect(tracker.onAgentEnd()).rejects.toThrow('boom');
    await tracker.onAgentEnd();

    expect(onTurnComplete).toHaveBeenCalledTimes(2);
  });
});

describe('registerTurnCompletionHooks', () => {
  it('wires handlers to agent lifecycle events', async () => {
    const handlers: {
      agent_end?: () => Promise<void>;
      agent_start?: () => Promise<void>;
      message_end?: (event: MessageEndLikeEvent) => Promise<void>;
    } = {};

    const api: CompletionEventAPI = {
      on(event, handler) {
        if (event === 'agent_start') {
          handlers.agent_start = handler as () => Promise<void>;
          return;
        }

        if (event === 'message_end') {
          handlers.message_end = handler as (event: MessageEndLikeEvent) => Promise<void>;
          return;
        }

        handlers.agent_end = handler as () => Promise<void>;
      },
    };

    const onTurnComplete = vi.fn();
    registerTurnCompletionHooks(api, onTurnComplete);

    await handlers.agent_start?.();
    await handlers.message_end?.({ message: { role: 'assistant', stopReason: 'stop' } });
    await handlers.agent_end?.();

    expect(onTurnComplete).toHaveBeenCalledTimes(1);
  });
});
