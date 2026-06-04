import { appendFileSync } from 'node:fs';

import { loadConfig } from './config';
import {
  buildOsc777Sequence,
  buildOsc9Sequence,
  type NotifyProtocol,
  resolveProtocol,
  wrapForTmuxIfNeeded,
} from './protocol';
import { sanitizeNotificationText } from './sanitize';

const MAX_TITLE_LENGTH = 64;
const MAX_BODY_LENGTH = 180;

type NotifyChannel = 'dev-tty' | 'stdout';

interface OutputWriter {
  isTTY?: boolean;
  write(chunk: string): unknown;
}

interface NotifierDeps {
  env: NodeJS.ProcessEnv;
  stdout: OutputWriter;
  writeDevTty: (chunk: string) => boolean;
}

export interface NotifyResult {
  notified: boolean;
  protocol?: NotifyProtocol;
  channel?: NotifyChannel;
  reason?: 'disabled' | 'non-tty';
}

function buildSequence(protocol: NotifyProtocol, title: string, body: string): string {
  if (protocol === 'osc9') {
    return buildOsc9Sequence(`${title}: ${body}`);
  }

  return buildOsc777Sequence(title, body);
}

function defaultWriteDevTty(chunk: string): boolean {
  try {
    appendFileSync('/dev/tty', chunk, { encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

function resolveDeps(partialDeps?: Partial<NotifierDeps>): NotifierDeps {
  return {
    env: partialDeps?.env ?? process.env,
    stdout: partialDeps?.stdout ?? process.stdout,
    writeDevTty: partialDeps?.writeDevTty ?? defaultWriteDevTty,
  };
}

export function createNotifier(partialDeps?: Partial<NotifierDeps>) {
  const deps = resolveDeps(partialDeps);

  return {
    notifyTurnComplete(): NotifyResult {
      const config = loadConfig(deps.env);

      if (!config.enabled) {
        return { notified: false, reason: 'disabled' };
      }

      const title = sanitizeNotificationText(config.title, 'Pi', MAX_TITLE_LENGTH);
      const body = sanitizeNotificationText(config.body, 'Turn complete', MAX_BODY_LENGTH);
      const protocol = resolveProtocol(deps.env, config.protocol);
      const sequence = buildSequence(protocol, title, body);
      const output = wrapForTmuxIfNeeded(sequence, deps.env, config.tmuxPassthrough);

      if (deps.writeDevTty(output)) {
        return { notified: true, protocol, channel: 'dev-tty' };
      }

      if (deps.stdout.isTTY === false) {
        return { notified: false, reason: 'non-tty' };
      }

      deps.stdout.write(output);
      return { notified: true, protocol, channel: 'stdout' };
    },
  };
}

export function notifyTurnComplete(partialDeps?: Partial<NotifierDeps>): NotifyResult {
  return createNotifier(partialDeps).notifyTurnComplete();
}
