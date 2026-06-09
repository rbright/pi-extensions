import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import { createTurnCompletionTracker, shouldNotifyFromAssistantMessage } from './completion';
import { type NotificationContent, notifyTurnComplete } from './notify';
import { summarizeAssistantMessage, summarizeLastAssistantMessage } from './summary';

type NotifyFn = (content?: NotificationContent) => void;

interface MessageLike {
  content?: unknown;
  role?: unknown;
  stopReason?: unknown;
  text?: unknown;
}

interface AgentEndLike {
  messages?: unknown;
}

export function registerDesktopNotifyExtension(
  pi: ExtensionAPI,
  notify: NotifyFn = (content) => {
    notifyTurnComplete(content);
  },
): void {
  let latestContent: NotificationContent = {};

  const tracker = createTurnCompletionTracker(() => {
    notify(latestContent);
  });

  pi.on('agent_start', async () => {
    latestContent = {};
    tracker.onAgentStart();
  });

  pi.on('message_end', async (event) => {
    const message = event.message as unknown as MessageLike;
    const completionMessage = {
      role: typeof message.role === 'string' ? message.role : undefined,
      stopReason: typeof message.stopReason === 'string' ? message.stopReason : undefined,
    };

    if (shouldNotifyFromAssistantMessage(completionMessage)) {
      const summary = summarizeAssistantMessage(message);
      if (summary) {
        latestContent = { body: summary };
      }
    }

    await tracker.onMessageEnd({
      message: completionMessage,
    });
  });

  pi.on('agent_end', async (event) => {
    const summary = summarizeLastAssistantMessage((event as AgentEndLike | undefined)?.messages);
    if (summary) {
      latestContent = { body: summary };
    }

    await tracker.onAgentEnd();
  });
}

export default function (pi: ExtensionAPI): void {
  registerDesktopNotifyExtension(pi);
}
