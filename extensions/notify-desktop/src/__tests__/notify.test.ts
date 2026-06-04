/* oxlint-disable sort-keys */

import { describe, expect, it, vi } from 'vitest';

import { notifyTurnComplete } from '../notify';

describe('notifyTurnComplete', () => {
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

  it('still notifies when TTY status is unavailable', () => {
    const write = vi.fn();
    const writeDevTty = vi.fn(() => false);

    const result = notifyTurnComplete({
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
    expect(write).toHaveBeenCalledWith('\u001b]777;notify;Pi;Turn complete — awaiting feedback\u001b\\');
  });

  it('writes OSC 9 notifications in iTerm2', () => {
    const write = vi.fn();
    const writeDevTty = vi.fn(() => false);

    const result = notifyTurnComplete({
      env: {
        TERM_PROGRAM: 'iTerm.app',
      },
      stdout: {
        isTTY: true,
        write,
      },
      writeDevTty,
    });

    expect(result).toEqual({
      channel: 'stdout',
      notified: true,
      protocol: 'osc9',
    });
    expect(write).toHaveBeenCalledWith('\u001b]9;Pi: Turn complete — awaiting feedback\u001b\\');
  });

  it('auto-selects OSC 9 in wezterm sessions', () => {
    const write = vi.fn();
    const writeDevTty = vi.fn(() => false);

    const result = notifyTurnComplete({
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
      channel: 'stdout',
      notified: true,
      protocol: 'osc9',
    });
    expect(write).toHaveBeenCalledWith('\u001b]9;Pi: Turn complete — awaiting feedback\u001b\\');
  });

  it('writes OSC 777 notifications when requested', () => {
    const write = vi.fn();
    const writeDevTty = vi.fn(() => false);

    const result = notifyTurnComplete({
      env: {
        PI_NOTIFY_DESKTOP_PROTOCOL: 'osc777',
      },
      stdout: {
        isTTY: true,
        write,
      },
      writeDevTty,
    });

    expect(result).toEqual({
      channel: 'stdout',
      notified: true,
      protocol: 'osc777',
    });
    expect(write).toHaveBeenCalledWith('\u001b]777;notify;Pi;Turn complete — awaiting feedback\u001b\\');
  });

  it('prefers /dev/tty when available', () => {
    const write = vi.fn();
    const writeDevTty = vi.fn(() => true);

    const result = notifyTurnComplete({
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
    expect(writeDevTty).toHaveBeenCalledWith('\u001b]9;Pi: Turn complete — awaiting feedback\u001b\\');
    expect(write).not.toHaveBeenCalled();
  });

  it('sanitizes message fields before emitting OSC 777', () => {
    const write = vi.fn();
    const writeDevTty = vi.fn(() => false);

    notifyTurnComplete({
      env: {
        PI_NOTIFY_DESKTOP_PROTOCOL: 'osc777',
        PI_NOTIFY_DESKTOP_TITLE: 'Pi;\u0007',
        PI_NOTIFY_DESKTOP_BODY: '\u001b done ; now',
      },
      stdout: {
        isTTY: true,
        write,
      },
      writeDevTty,
    });

    expect(write).toHaveBeenCalledWith('\u001b]777;notify;Pi;done now\u001b\\');
  });

  it('wraps notification sequence for tmux when enabled', () => {
    const write = vi.fn();
    const writeDevTty = vi.fn(() => false);

    notifyTurnComplete({
      env: {
        PI_NOTIFY_DESKTOP_PROTOCOL: 'osc9',
        TMUX: '/tmp/tmux-1000/default,1,0',
      },
      stdout: {
        isTTY: true,
        write,
      },
      writeDevTty,
    });

    expect(write).toHaveBeenCalledWith(
      '\u001bPtmux;\u001b\u001b]9;Pi: Turn complete — awaiting feedback\u001b\u001b\\\u001b\\',
    );
  });
});
