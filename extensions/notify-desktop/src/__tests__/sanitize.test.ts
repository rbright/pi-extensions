/* oxlint-disable no-magic-numbers */

import { describe, expect, it } from 'vitest';

import { sanitizeNotificationText, truncateText } from '../sanitize';

describe('sanitizeNotificationText', () => {
  it('strips control characters and semicolons', () => {
    const value = sanitizeNotificationText('Pi;\u0007\u001b[31m Ready', 'fallback', 100);
    expect(value).toBe('Pi [31m Ready');
  });

  it('normalizes whitespace', () => {
    const value = sanitizeNotificationText('  Turn\n\ncomplete\t now  ', 'fallback', 100);
    expect(value).toBe('Turn complete now');
  });

  it('falls back when sanitized text is empty', () => {
    const value = sanitizeNotificationText('\u0007\u001b', 'fallback text', 100);
    expect(value).toBe('fallback text');
  });

  it('truncates long values and appends ellipsis', () => {
    const value = sanitizeNotificationText('abcdefghij', 'fallback', 6);
    expect(value).toBe('abcde…');
  });
});

describe('truncateText', () => {
  it('returns only ellipsis when maxLength is less than or equal to one', () => {
    expect(truncateText('abcdef', 1)).toBe('…');
    expect(truncateText('abcdef', 0)).toBe('…');
  });
});
