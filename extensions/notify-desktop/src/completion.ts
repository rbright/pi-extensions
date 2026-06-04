const NON_COMPLETION_STOP_REASONS = new Set(['toolUse', 'error', 'aborted']);

export type MaybePromise = void | Promise<void>;

export interface CompletionMessage {
  role?: string | null;
  stopReason?: string | null;
}

export interface MessageEndLikeEvent {
  message: CompletionMessage;
}

export interface CompletionEventAPI {
  on(event: 'agent_start', handler: () => MaybePromise): void;
  on(event: 'message_end', handler: (event: MessageEndLikeEvent) => MaybePromise): void;
  on(event: 'agent_end', handler: () => MaybePromise): void;
}

function shouldSuppressForStopReason(stopReason: string | null | undefined): boolean {
  if (stopReason == null) {
    return false;
  }

  return NON_COMPLETION_STOP_REASONS.has(stopReason);
}

export function shouldNotifyFromAssistantMessage(message: CompletionMessage): boolean {
  if (message.role !== 'assistant') {
    return false;
  }

  return !shouldSuppressForStopReason(message.stopReason);
}

export interface TurnCompletionTracker {
  onAgentStart(): void;
  onMessageEnd(event: MessageEndLikeEvent): Promise<void>;
  onAgentEnd(): Promise<void>;
}

export function createTurnCompletionTracker(onTurnComplete: () => MaybePromise): TurnCompletionTracker {
  let notifiedInCurrentAgent = false;
  let inFlight: Promise<void> | undefined;

  const triggerNotify = async (): Promise<void> => {
    if (notifiedInCurrentAgent) {
      return;
    }

    if (inFlight) {
      await inFlight;
      return;
    }

    inFlight = Promise.resolve(onTurnComplete())
      .then(() => {
        notifiedInCurrentAgent = true;
      })
      .finally(() => {
        inFlight = undefined;
      });

    await inFlight;
  };

  return {
    onAgentStart(): void {
      notifiedInCurrentAgent = false;
      inFlight = undefined;
    },

    async onMessageEnd(event: MessageEndLikeEvent): Promise<void> {
      if (!shouldNotifyFromAssistantMessage(event.message)) {
        return;
      }

      await triggerNotify();
    },

    async onAgentEnd(): Promise<void> {
      await triggerNotify();
    },
  };
}

export function registerTurnCompletionHooks(api: CompletionEventAPI, onTurnComplete: () => MaybePromise): void {
  const tracker = createTurnCompletionTracker(onTurnComplete);

  api.on('agent_start', async () => {
    tracker.onAgentStart();
  });

  api.on('message_end', async (event) => {
    await tracker.onMessageEnd(event);
  });

  api.on('agent_end', async () => {
    await tracker.onAgentEnd();
  });
}
