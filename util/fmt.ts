import { dbSerialize } from "../db.js";
import { ChannelInfo } from "./channel.js";

const WHITESPACE_REGEX = /\s+/g;

export function sanitizeWhitespace(value: string): string {
  return value.replaceAll(WHITESPACE_REGEX, ' ');
}

/**
 * Strips common Discord markdown syntax (code spans, bold/italic/underline,
 * strikethrough, spoilers, blockquotes, headings) from a string, leaving plain text.
 * Useful for contexts that render as plain text, like autocomplete choice labels.
 */
export function sanitizeMarkdown(value: string): string {
  return value
    .replace(/```([\s\S]*?)```/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/__([^_]*)__/g, '$1')
    .replace(/_([^_]*)_/g, '$1')
    .replace(/~~([^~]*)~~/g, '$1')
    .replace(/\|\|([^|]*)\|\|/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/#/g, ' ')
    .trim();
}

export function maxLength(value: string, maxLength: number, ellipsis = ' […]'): string {
  if (value.length > maxLength) {
    value = value.substring(0, maxLength - ellipsis.length);
    value += ellipsis;
  }
  return value;
}

/**
 * Batches lines into chunks whose joined (newline-separated) length stays within
 * `maxLength`, without splitting a single line across chunks. Useful for sending
 * long lists as multiple Discord messages instead of one that overflows the limit.
 * A single line longer than `maxLength` becomes its own oversized chunk.
 * @param maxLength The max length per chunk. Defaults to Discord's message content limit.
 */
export function batchLines(lines: string[], maxLength = 2000): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (current && candidate.length > maxLength) {
      chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

export interface WrapInCodeOptions {
  maxLength?: number;
  language?: string;
  forceLine?: "single" | "multi";
}

/**
 * Wraps the given value in a code block. Might return a single or multi line code block dependong on usage.
 * @param value The value to wrap in code. If it is not a string it will be serialized.
 */
export function wrapInCode(value: unknown, opts: WrapInCodeOptions | null = null): string {
  let lang = opts?.language;
  let str: string;
  if (value === undefined) {
    str = 'undefined';
  } else if (typeof value !== 'string') {
    str = dbSerialize(value as object);
    if (!lang) {
      lang = 'json';
    }
  } else {
    str = value;
  }
  str = maxLength(str, opts?.maxLength ?? 1500);
  if (opts?.forceLine !== "single" && (opts?.forceLine === "multi" || str.includes('\n'))) {
    return '```' + (lang ?? '') + '\n' + str + '\n```';
  } else {
    return '`' + str + '`';
  }
}

export function channelInfoToString(value: ChannelInfo | null | undefined, opts: { excludeParent?: boolean } = {}): string {
  if (!opts.excludeParent) {
    opts.excludeParent = false;
  }
  if (!value) {
    return 'None';
  }
  if (value.parent && !opts.excludeParent) {
    return `<#${value.id}> (${value.name}) in ${channelInfoToString(value.parent)}`;
  }
  return `<#${value.id}> (${value.name})`;
}

export function booleanToString(value: boolean, yesIsBad = false, yesStr = 'Yes', noStr = 'No'): string {
  return value ? (yesIsBad ? (':red_circle: ' + yesStr) : (':green_circle: ' + yesStr)) : (yesIsBad ? (':green_circle: ' + noStr) : (':red_circle: No' + noStr));
}

export function msToString(ms: number): string {
  if (ms < 0) ms = -ms;
  const dayMs = 86400000;
  const time = {
    week: Math.floor(ms / (dayMs * 7)),
    day: Math.floor(ms / dayMs) % 7,
    hour: Math.floor(ms / 3600000) % 24,
    minute: Math.floor(ms / 60000) % 60,
    second: Math.floor(ms / 1000) % 60,
    millisecond: Math.floor(ms) % 1000
  };
  return Object.entries(time)
    .filter(val => val[1] !== 0)
    .map(([key, val]) => `${val} ${key}${val !== 1 ? 's' : ''}`)
    .join(', ');
}

export function stringList(list: string[] | false | null | undefined | string, emptyStr = 'None', joinStr = ', '): string {
  if (!list) {
    return emptyStr;
  }
  if (typeof list === 'string') {
    return list;
  }
  const filtered = list.filter(e => typeof e === 'string' && e.length > 0);
  if (filtered.length === 0) {
    return emptyStr;
  }
  return filtered.join(joinStr);
}

export function ratioToString(value: number, total: number, digits = 2): string {
  if (value === 0 || total === 0) {
    return (0).toFixed(digits) + '%';
  }
  return ((value / total) * 100).toFixed(digits) + '%';
}

export const COLOR = {
  RESET: '\x1b[0m',
  DIM: "\x1b[2m",
  FG_MAGENTA: "\x1b[35m"
};
