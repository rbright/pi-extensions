/* oxlint-disable max-statements */

import { describe, expect, it } from 'vitest';

import {
  buildOsc777Sequence,
  buildOsc9Sequence,
  isGhostty,
  isIterm2,
  isTmux,
  isWezTerm,
  isZellij,
  resolveProtocol,
  wrapForTmuxIfNeeded,
} from '../protocol';

describe('protocol', () => {
  it('detects iTerm2 from TERM_PROGRAM', () => {
    expect(isIterm2({ TERM_PROGRAM: 'iTerm.app' })).toBe(true);
  });

  it('detects iTerm2 from ITERM_SESSION_ID', () => {
    expect(isIterm2({ ITERM_SESSION_ID: 'abc' })).toBe(true);
  });

  it('detects wezterm sessions', () => {
    expect(isWezTerm({ TERM_PROGRAM: 'WezTerm' })).toBe(true);
    expect(isWezTerm({ WEZTERM_PANE: '1' })).toBe(true);
  });

  it('detects ghostty sessions', () => {
    expect(isGhostty({ TERM_PROGRAM: 'ghostty' })).toBe(true);
    expect(isGhostty({ GHOSTTY_RESOURCES_DIR: '/tmp/ghostty' })).toBe(true);
  });

  it('detects zellij sessions', () => {
    expect(isZellij({ ZELLIJ: '0' })).toBe(true);
    expect(isZellij({ ZELLIJ_SESSION_NAME: 'work' })).toBe(true);
  });

  it('detects tmux sessions', () => {
    expect(isTmux({ TMUX: '/tmp/tmux-1000/default,1,0' })).toBe(true);
  });

  it('uses osc9 for auto mode in iTerm2', () => {
    const protocol = resolveProtocol({ TERM_PROGRAM: 'iTerm.app' }, 'auto');
    expect(protocol).toBe('osc9');
  });

  it('uses osc9 for auto mode in wezterm sessions', () => {
    const protocol = resolveProtocol({ TERM_PROGRAM: 'WezTerm' }, 'auto');
    expect(protocol).toBe('osc9');
  });

  it('uses osc777 for auto mode in ghostty sessions', () => {
    const protocol = resolveProtocol({ TERM_PROGRAM: 'ghostty' }, 'auto');
    expect(protocol).toBe('osc777');
  });

  it('uses osc9 fallback for zellij sessions when terminal cannot be detected', () => {
    const protocol = resolveProtocol({ ZELLIJ: '0' }, 'auto');
    expect(protocol).toBe('osc9');
  });

  it('honors explicit protocol overrides', () => {
    expect(resolveProtocol({ TERM_PROGRAM: 'ghostty' }, 'osc9')).toBe('osc9');
    expect(resolveProtocol({ TERM_PROGRAM: 'WezTerm' }, 'osc777')).toBe('osc777');
  });

  it('builds OSC 9 sequences', () => {
    expect(buildOsc9Sequence('Pi: Ready')).toBe('\u001b]9;Pi: Ready\u001b\\');
  });

  it('builds OSC 777 sequences', () => {
    expect(buildOsc777Sequence('Pi', 'Ready')).toBe('\u001b]777;notify;Pi;Ready\u001b\\');
  });

  it('wraps sequences for tmux passthrough when enabled', () => {
    const wrapped = wrapForTmuxIfNeeded('\u001b]9;Pi\u0007', { TMUX: '/tmp/tmux-1000/default,1,0' }, true);
    expect(wrapped).toBe('\u001bPtmux;\u001b\u001b]9;Pi\u0007\u001b\\');
  });

  it('returns original sequence when tmux passthrough is disabled', () => {
    const sequence = '\u001b]9;Pi\u0007';
    expect(wrapForTmuxIfNeeded(sequence, { TMUX: 'x' }, false)).toBe(sequence);
  });
});
