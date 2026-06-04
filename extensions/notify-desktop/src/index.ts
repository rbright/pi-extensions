import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import { createTurnCompletionTracker } from './completion';
import { notifyTurnComplete } from './notify';

type NotifyFn = () => void;

interface MessageLike {
  role?: unknown;
  stopReason?: unknown;
}

export function registerDesktopNotifyExtension(
  pi: ExtensionAPI,
  notify: NotifyFn = () => {
    notifyTurnComplete();
  },
): void {
  const tracker = createTurnCompletionTracker(() => {
    notify();
  });

  pi.on('agent_start', async () => {
    tracker.onAgentStart();
  });

  pi.on('message_end', async (event) => {
    const message = event.message as unknown as MessageLike;

    await tracker.onMessageEnd({
      message: {
        role: typeof message.role === 'string' ? message.role : undefined,
        stopReason: typeof message.stopReason === 'string' ? message.stopReason : undefined,
      },
    });
  });

  pi.on('agent_end', async () => {
    await tracker.onAgentEnd();
  });
}

export default function (pi: ExtensionAPI): void {
  registerDesktopNotifyExtension(pi);
}
