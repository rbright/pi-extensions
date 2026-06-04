import type { ProtocolPreference } from './config';

export type NotifyProtocol = 'osc9' | 'osc777';

export function isIterm2(env: NodeJS.ProcessEnv): boolean {
  return env.TERM_PROGRAM?.toLowerCase() === 'iterm.app' || Boolean(env.ITERM_SESSION_ID);
}

export function isWezTerm(env: NodeJS.ProcessEnv): boolean {
  return env.TERM_PROGRAM?.toLowerCase() === 'wezterm' || Boolean(env.WEZTERM_EXECUTABLE) || Boolean(env.WEZTERM_PANE);
}

export function isGhostty(env: NodeJS.ProcessEnv): boolean {
  return (
    env.TERM_PROGRAM?.toLowerCase() === 'ghostty' || Boolean(env.GHOSTTY_BIN_DIR) || Boolean(env.GHOSTTY_RESOURCES_DIR)
  );
}

export function isZellij(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.ZELLIJ) || Boolean(env.ZELLIJ_SESSION_NAME);
}

export function isTmux(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.TMUX);
}

export function resolveProtocol(env: NodeJS.ProcessEnv, preferred: ProtocolPreference): NotifyProtocol {
  if (preferred === 'osc9' || preferred === 'osc777') {
    return preferred;
  }

  if (isIterm2(env) || isWezTerm(env)) {
    return 'osc9';
  }

  if (isGhostty(env)) {
    return 'osc777';
  }

  // zellij can hide parent terminal env in some layouts; default to OSC 9 in that case.
  if (isZellij(env)) {
    return 'osc9';
  }

  return 'osc777';
}

export function buildOsc9Sequence(message: string): string {
  return `\u001b]9;${message}\u001b\\`;
}

export function buildOsc777Sequence(title: string, body: string): string {
  return `\u001b]777;notify;${title};${body}\u001b\\`;
}

export function wrapForTmuxIfNeeded(sequence: string, env: NodeJS.ProcessEnv, enabled: boolean): string {
  if (!enabled || !isTmux(env)) {
    return sequence;
  }

  const escaped = sequence.replaceAll('\u001b', '\u001b\u001b');
  return `\u001bPtmux;${escaped}\u001b\\`;
}
