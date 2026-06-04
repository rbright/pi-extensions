/* oxlint-disable sort-keys */

import { describe, expect, it } from 'vitest';

import { loadConfig } from '../config';

describe('loadConfig', () => {
  it('returns defaults when env vars are missing', () => {
    const config = loadConfig({});

    expect(config).toEqual({
      enabled: true,
      protocol: 'auto',
      title: 'Pi',
      body: 'Turn complete — awaiting feedback',
      tmuxPassthrough: true,
    });
  });

  it('parses boolean and protocol env vars', () => {
    const config = loadConfig({
      PI_NOTIFY_DESKTOP_ENABLED: '0',
      PI_NOTIFY_DESKTOP_PROTOCOL: 'osc9',
      PI_NOTIFY_DESKTOP_TMUX_PASSTHROUGH: 'false',
    });

    expect(config.enabled).toBe(false);
    expect(config.protocol).toBe('osc9');
    expect(config.tmuxPassthrough).toBe(false);
  });

  it('falls back to auto when protocol is invalid', () => {
    const config = loadConfig({
      PI_NOTIFY_DESKTOP_PROTOCOL: 'invalid',
    });

    expect(config.protocol).toBe('auto');
  });

  it('uses fallback text when title or body are empty', () => {
    const config = loadConfig({
      PI_NOTIFY_DESKTOP_TITLE: '   ',
      PI_NOTIFY_DESKTOP_BODY: '',
    });

    expect(config.title).toBe('Pi');
    expect(config.body).toBe('Turn complete — awaiting feedback');
  });
});
