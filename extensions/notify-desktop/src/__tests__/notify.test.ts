/* oxlint-disable sort-keys */

import { describe, expect, it, vi } from 'vitest';

import { notifyTurnComplete } from '../notify';

const platformDeps = {
  cwd: () => '/home/rbright/Projects/platform',
};

const outputDeps = (env: NodeJS.ProcessEnv = {}) => {
  const write = vi.fn();
  const writeDevTty = vi.fn(() => false);

  return {
    deps: {
      ...platformDeps,
      env,
      stdout: {
        isTTY: true,
        write,
      },
      writeDevTty,
    },
    write,
    writeDevTty,
  };
};

describe('notifyTurnComplete gating', () => {
  it('does not notify when disabled', () => {
    const write = vi.fn();
    const writeDevTty = vi.fn(() => false);

    const result = notifyTurnComplete({
      env: {
        PI_NOTIFY_DESKTOP_ENABLED: 'false',
      },
      stdout: {
        isTTY: true,
        write,
      },
      writeDevTty,
    });

    expect(result).toEqual({
      notified: false,
      reason: 'disabled',
    });
    expect(writeDevTty).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('does not notify when stdout is not a TTY and /dev/tty write fails', () => {
    const write = vi.fn();
    const writeDevTty = vi.fn(() => false);

    const result = notifyTurnComplete({
      ...platformDeps,
      env: {},
      stdout: {
        isTTY: false,
        write,
      },
      writeDevTty,
    });

    expect(result).toEqual({
      notified: false,
      reason: 'non-tty',
    });
    expect(write).not.toHaveBeenCalled();
  });

  it('prefers /dev/tty when available', () => {
    const write = vi.fn();
    const writeDevTty = vi.fn(() => true);

    const result = notifyTurnComplete({
      ...platformDeps,
      env: {
        TERM_PROGRAM: 'WezTerm',
      },
      stdout: {
        isTTY: true,
        write,
      },
      writeDevTty,
    });

    expect(result).toEqual({
      channel: 'dev-tty',
      notified: true,
      protocol: 'osc9',
    });
    expect(writeDevTty).toHaveBeenCalledWith('\u001b]9;platform: Turn complete — awaiting feedback\u001b\\');
    expect(write).not.toHaveBeenCalled();
  });
});

describe('notifyTurnComplete protocol output', () => {
  it('still notifies when TTY status is unavailable', () => {
    const write = vi.fn();
    const writeDevTty = vi.fn(() => false);

    const result = notifyTurnComplete({
      ...platformDeps,
      env: {
        PI_NOTIFY_DESKTOP_PROTOCOL: 'osc777',
      },
      stdout: {
        write,
      },
      writeDevTty,
    });

    expect(result).toEqual({
      channel: 'stdout',
      notified: true,
      protocol: 'osc777',
    });
    expect(write).toHaveBeenCalledWith('\u001b]777;notify;platform;Turn complete — awaiting feedback\u001b\\');
  });

  it('writes OSC 9 notifications in iTerm2', () => {
    const { deps, write } = outputDeps({ TERM_PROGRAM: 'iTerm.app' });

    const result = notifyTurnComplete(deps);

    expect(result).toEqual({
      channel: 'stdout',
      notified: true,
      protocol: 'osc9',
    });
    expect(write).toHaveBeenCalledWith('\u001b]9;platform: Turn complete — awaiting feedback\u001b\\');
  });

  it('auto-selects OSC 9 in wezterm sessions', () => {
    const { deps, write } = outputDeps({ TERM_PROGRAM: 'WezTerm' });

    const result = notifyTurnComplete(deps);

    expect(result).toEqual({
      channel: 'stdout',
      notified: true,
      protocol: 'osc9',
    });
    expect(write).toHaveBeenCalledWith('\u001b]9;platform: Turn complete — awaiting feedback\u001b\\');
  });

  it('writes OSC 777 notifications when requested', () => {
    const { deps, write } = outputDeps({ PI_NOTIFY_DESKTOP_PROTOCOL: 'osc777' });

    const result = notifyTurnComplete(deps);

    expect(result).toEqual({
      channel: 'stdout',
      notified: true,
      protocol: 'osc777',
    });
    expect(write).toHaveBeenCalledWith('\u001b]777;notify;platform;Turn complete — awaiting feedback\u001b\\');
  });
});

describe('notifyTurnComplete content and sanitization', () => {
  it('sanitizes message fields before emitting OSC 777', () => {
    const { deps, write } = outputDeps({
      PI_NOTIFY_DESKTOP_PROTOCOL: 'osc777',
      PI_NOTIFY_DESKTOP_TITLE: 'Pi;\u0007',
      PI_NOTIFY_DESKTOP_BODY: '\u001b done ; now',
    });

    notifyTurnComplete(deps);

    expect(write).toHaveBeenCalledWith('\u001b]777;notify;Pi;done now\u001b\\');
  });

  it('uses assistant summary content when provided', () => {
    const { deps, write } = outputDeps({ PI_NOTIFY_DESKTOP_PROTOCOL: 'osc777' });

    notifyTurnComplete({ body: 'Updated the platform deployment docs.' }, deps);

    expect(write).toHaveBeenCalledWith('\u001b]777;notify;platform;Updated the platform deployment docs.\u001b\\');
  });
});

describe('notifyTurnComplete tmux titles', () => {
  it('wraps notification sequence for tmux when enabled', () => {
    const { deps, write } = outputDeps({
      PI_NOTIFY_DESKTOP_PROTOCOL: 'osc9',
      TMUX: '/tmp/tmux-1000/default,1,0',
      TMUX_PANE: '%7',
    });
    const execFileSync = vi.fn(() => 'platform\n') as never;

    notifyTurnComplete({ ...deps, execFileSync });

    expect(execFileSync).toHaveBeenCalledWith('tmux', ['display-message', '-p', '-t', '%7', '#S'], expect.any(Object));
    expect(write).toHaveBeenCalledWith(
      '\u001bPtmux;\u001b\u001b]9;platform: Turn complete — awaiting feedback\u001b\u001b\\\u001b\\',
    );
  });

  it('uses the cwd basename when tmux session lookup fails', () => {
    const { deps, write } = outputDeps({
      PI_NOTIFY_DESKTOP_PROTOCOL: 'osc777',
      TMUX: '/tmp/tmux-1000/default,1,0',
    });
    const execFileSync = vi.fn(() => {
      throw new Error('tmux unavailable');
    }) as never;

    notifyTurnComplete({ ...deps, execFileSync });

    expect(write).toHaveBeenCalledWith(
      '\u001bPtmux;\u001b\u001b]777;notify;platform;Turn complete — awaiting feedback\u001b\u001b\\\u001b\\',
    );
  });
});
