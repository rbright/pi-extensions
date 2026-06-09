export type ProtocolPreference = 'auto' | 'osc9' | 'osc777';

export interface NotifyDesktopConfig {
  enabled: boolean;
  protocol: ProtocolPreference;
  title?: string;
  body?: string;
  tmuxPassthrough: boolean;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function parseProtocol(value: string | undefined): ProtocolPreference {
  if (!value) {
    return 'auto';
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'osc9' || normalized === 'osc777' || normalized === 'auto') {
    return normalized;
  }

  return 'auto';
}

function readText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): NotifyDesktopConfig {
  return {
    enabled: parseBoolean(env.PI_NOTIFY_DESKTOP_ENABLED, true),
    protocol: parseProtocol(env.PI_NOTIFY_DESKTOP_PROTOCOL),
    title: readText(env.PI_NOTIFY_DESKTOP_TITLE),
    body: readText(env.PI_NOTIFY_DESKTOP_BODY),
    tmuxPassthrough: parseBoolean(env.PI_NOTIFY_DESKTOP_TMUX_PASSTHROUGH, true),
  };
}
