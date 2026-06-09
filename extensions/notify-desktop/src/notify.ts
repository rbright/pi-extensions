import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { basename } from 'node:path';

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
const DEFAULT_TITLE = 'Pi';
const DEFAULT_BODY = 'Turn complete — awaiting feedback';

type NotifyChannel = 'dev-tty' | 'stdout';

interface OutputWriter {
  isTTY?: boolean;
  write(chunk: string): unknown;
}

export interface NotificationContent {
  title?: string;
  body?: string;
}

interface NotifierDeps {
  cwd: () => string;
  env: NodeJS.ProcessEnv;
  execFileSync: typeof execFileSync;
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

function titleFromCwd(cwd: string): string {
  return basename(cwd) || basename(cwd.replace(/\/$/u, '')) || DEFAULT_TITLE;
}

function titleFromTmuxSession(deps: NotifierDeps): string | undefined {
  if (!deps.env.TMUX) {
    return undefined;
  }

  const args = ['display-message', '-p'];
  if (deps.env.TMUX_PANE) {
    args.push('-t', deps.env.TMUX_PANE);
  }
  args.push('#S');

  try {
    const output = deps.execFileSync('tmux', args, {
      encoding: 'utf8',
      env: deps.env,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const session = String(output).trim();
    return session || undefined;
  } catch {
    return undefined;
  }
}

function resolveTitle(configTitle: string | undefined, contentTitle: string | undefined, deps: NotifierDeps): string {
  return configTitle ?? contentTitle ?? titleFromTmuxSession(deps) ?? titleFromCwd(deps.env.PWD ?? deps.cwd());
}

function resolveBody(configBody: string | undefined, contentBody: string | undefined): string {
  return configBody ?? contentBody ?? DEFAULT_BODY;
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
    cwd: partialDeps?.cwd ?? process.cwd,
    env: partialDeps?.env ?? process.env,
    execFileSync: partialDeps?.execFileSync ?? execFileSync,
    stdout: partialDeps?.stdout ?? process.stdout,
    writeDevTty: partialDeps?.writeDevTty ?? defaultWriteDevTty,
  };
}

export function createNotifier(partialDeps?: Partial<NotifierDeps>) {
  const deps = resolveDeps(partialDeps);

  return {
    notifyTurnComplete(content: NotificationContent = {}): NotifyResult {
      const config = loadConfig(deps.env);

      if (!config.enabled) {
        return { notified: false, reason: 'disabled' };
      }

      const title = sanitizeNotificationText(
        resolveTitle(config.title, content.title, deps),
        DEFAULT_TITLE,
        MAX_TITLE_LENGTH,
      );
      const body = sanitizeNotificationText(resolveBody(config.body, content.body), DEFAULT_BODY, MAX_BODY_LENGTH);
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

function isNotifierDeps(
  value: NotificationContent | Partial<NotifierDeps> | undefined,
): value is Partial<NotifierDeps> {
  return Boolean(
    value &&
    ('cwd' in value || 'env' in value || 'execFileSync' in value || 'stdout' in value || 'writeDevTty' in value),
  );
}

export function notifyTurnComplete(
  contentOrDeps?: NotificationContent | Partial<NotifierDeps>,
  partialDeps?: Partial<NotifierDeps>,
): NotifyResult {
  if (isNotifierDeps(contentOrDeps)) {
    return createNotifier(contentOrDeps).notifyTurnComplete();
  }

  return createNotifier(partialDeps).notifyTurnComplete(contentOrDeps);
}
