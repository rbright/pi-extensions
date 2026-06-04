const CONTROL_CHAR_REGEX = /[\p{Cc}\p{Cf}]/gu;

export function truncateText(input: string, maxLength: number): string {
  if (input.length <= maxLength) {
    return input;
  }

  if (maxLength <= 1) {
    return '…';
  }

  return `${input.slice(0, maxLength - 1)}…`;
}

export function sanitizeNotificationText(input: string, fallback: string, maxLength: number): string {
  const sanitized = input.replace(CONTROL_CHAR_REGEX, ' ').replaceAll(';', ' ').replace(/\s+/g, ' ').trim();

  if (sanitized.length === 0) {
    return truncateText(fallback, maxLength);
  }

  return truncateText(sanitized, maxLength);
}
