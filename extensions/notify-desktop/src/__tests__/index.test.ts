/* oxlint-disable func-style, no-magic-numbers, sort-keys */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { describe, expect, it, vi } from 'vitest';

import registerExtension, { registerDesktopNotifyExtension } from '../index';

type EventHandler = (event: unknown, ctx: unknown) => Promise<void>;

function setupExtension(notifyImpl: () => void) {
  const handlers = new Map<string, EventHandler>();

  const on = vi.fn((eventName: string, callback: EventHandler) => {
    handlers.set(eventName, callback);
  });

  const registerCommand = vi.fn();
  registerDesktopNotifyExtension({ on, registerCommand } as unknown as ExtensionAPI, notifyImpl);

  return {
    handlers,
    registerCommand,
  };
}

describe('registerDesktopNotifyExtension', () => {
  it('notifies when assistant message completes with stop reason', async () => {
    const notify = vi.fn();
    const { handlers } = setupExtension(notify);

    await handlers.get('agent_start')?.({ type: 'agent_start' }, {});
    await handlers.get('message_end')?.(
      {
        message: {
          role: 'assistant',
          stopReason: 'stop',
        },
        type: 'message_end',
      },
      {},
    );
    await handlers.get('agent_end')?.({ type: 'agent_end', messages: [] }, {});

    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('does not notify for toolUse assistant messages and falls back to agent_end', async () => {
    const notify = vi.fn();
    const { handlers } = setupExtension(notify);

    await handlers.get('agent_start')?.({ type: 'agent_start' }, {});
    await handlers.get('message_end')?.(
      {
        message: {
          role: 'assistant',
          stopReason: 'toolUse',
        },
        type: 'message_end',
      },
      {},
    );
    expect(notify).toHaveBeenCalledTimes(0);

    await handlers.get('agent_end')?.({ type: 'agent_end', messages: [] }, {});
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('passes assistant message summaries into notifications', async () => {
    const notify = vi.fn();
    const { handlers } = setupExtension(notify);

    await handlers.get('agent_start')?.({ type: 'agent_start' }, {});
    await handlers.get('message_end')?.(
      {
        message: {
          role: 'assistant',
          stopReason: 'stop',
          content: 'Updated the platform deployment docs. Run `just lint` next.',
        },
        type: 'message_end',
      },
      {},
    );

    expect(notify).toHaveBeenCalledWith({ body: 'Updated the platform deployment docs.' });
  });

  it('does not use suppressed tool-use messages as fallback summaries', async () => {
    const notify = vi.fn();
    const { handlers } = setupExtension(notify);

    await handlers.get('agent_start')?.({ type: 'agent_start' }, {});
    await handlers.get('message_end')?.(
      {
        message: {
          role: 'assistant',
          stopReason: 'toolUse',
          content: 'Need to inspect files.',
        },
        type: 'message_end',
      },
      {},
    );
    await handlers.get('agent_end')?.({ type: 'agent_end', messages: [] }, {});

    expect(notify).toHaveBeenCalledWith({});
  });

  it('uses agent_end messages for fallback notification summaries', async () => {
    const notify = vi.fn();
    const { handlers } = setupExtension(notify);

    await handlers.get('agent_start')?.({ type: 'agent_start' }, {});
    await handlers.get('message_end')?.(
      {
        message: {
          role: 'assistant',
          stopReason: 'toolUse',
          content: 'Need to inspect files.',
        },
        type: 'message_end',
      },
      {},
    );
    await handlers.get('agent_end')?.(
      {
        messages: [{ role: 'assistant', content: [{ text: 'Finished the Ghostty cask addition.' }] }],
        type: 'agent_end',
      },
      {},
    );

    expect(notify).toHaveBeenCalledWith({ body: 'Finished the Ghostty cask addition.' });
  });

  it('default export registers lifecycle hooks', () => {
    const on = vi.fn();
    const registerCommand = vi.fn();

    registerExtension({ on, registerCommand } as unknown as ExtensionAPI);

    expect(on).toHaveBeenCalledWith('agent_start', expect.any(Function));
    expect(on).toHaveBeenCalledWith('message_end', expect.any(Function));
    expect(on).toHaveBeenCalledWith('agent_end', expect.any(Function));
    expect(registerCommand).not.toHaveBeenCalled();
  });

  it('does not register slash commands', () => {
    const notify = vi.fn();
    const { registerCommand } = setupExtension(notify);

    expect(registerCommand).not.toHaveBeenCalled();
  });
});
