const MAX_SUMMARY_LENGTH = 160;
const TEXT_KEYS = ['text', 'content', 'message', 'value'] as const;

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function truncateSummary(text: string): string {
  if (text.length <= MAX_SUMMARY_LENGTH) {
    return text;
  }

  return `${text.slice(0, MAX_SUMMARY_LENGTH - 1).trimEnd()}…`;
}

function firstSentenceOrLine(text: string): string {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return '';
  }

  const sentence = normalized.match(/^(.+?[.!?])(?:\s|$)/u)?.[1];
  return sentence ?? normalized;
}

function collectText(value: unknown, depth = 0): string[] {
  if (depth > 4 || value == null) {
    return [];
  }

  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectText(item, depth + 1));
  }

  if (typeof value !== 'object') {
    return [];
  }

  const record = value as Record<string, unknown>;
  const parts: string[] = [];

  for (const key of TEXT_KEYS) {
    if (key in record) {
      parts.push(...collectText(record[key], depth + 1));
    }
  }

  return parts;
}

export function summarizeAssistantMessage(message: unknown): string | undefined {
  const text = firstSentenceOrLine(collectText(message).join(' '));
  return text ? truncateSummary(text) : undefined;
}

export function summarizeLastAssistantMessage(messages: unknown): string | undefined {
  if (!Array.isArray(messages)) {
    return undefined;
  }

  for (const message of [...messages].reverse()) {
    if (typeof message !== 'object' || message == null) {
      continue;
    }

    const role = (message as Record<string, unknown>).role;
    if (role !== 'assistant') {
      continue;
    }

    const summary = summarizeAssistantMessage(message);
    if (summary) {
      return summary;
    }
  }

  return undefined;
}
