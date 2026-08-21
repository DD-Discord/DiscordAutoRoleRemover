const { dbSerialize } = require("./db");

const WHITESPACE_REGEX = /\s+/g;

/**
 * @param {string} value
 */
function sanitizeWhitespace(value) {
  return value.replaceAll(WHITESPACE_REGEX, ' ');
}
module.exports.sanitizeWhitespace = sanitizeWhitespace;

/**
 * Strips common Discord markdown syntax (code spans, bold/italic/underline,
 * strikethrough, spoilers, blockquotes, headings) from a string, leaving plain text.
 * Useful for contexts that render as plain text, like autocomplete choice labels.
 * @param {string} value
 * @returns {string}
 */
function sanitizeMarkdown(value) {
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
module.exports.sanitizeMarkdown = sanitizeMarkdown;

/**
 * @param {string} value 
 * @param {number} maxLength 
 */
function maxLength(value, maxLength) {
  if (value.length > maxLength) {
    value = value.substring(0, maxLength);
    value += ' […]';
  }
  return value;
}
module.exports.maxLength = maxLength;

/**
 * Batches lines into chunks whose joined (newline-separated) length stays within
 * `maxLength`, without splitting a single line across chunks. Useful for sending
 * long lists as multiple Discord messages instead of one that overflows the limit.
 * A single line longer than `maxLength` becomes its own oversized chunk.
 * @param {string[]} lines The lines to batch.
 * @param {number} maxLength The max length per chunk. Defaults to Discord's message content limit.
 * @returns {string[]} The batched chunks.
 */
function batchLines(lines, maxLength = 2000) {
  const chunks = [];
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
module.exports.batchLines = batchLines;

/**
 * Wraps the given value in a code block. Might return a single or multi line code block dependong on usage.
 * @param {any} value The value to wrap in code. If it is not a string it will be serialized.
 * @param {{maxLength?: number, language?: string, forceLine?: "single" | "multi"}?} opts Additional options for formatting.
 * @returns {string} The formatted string.
 */
function wrapInCode(value, opts = null) {
  let lang = opts?.language;
  if (value === undefined) {
    value = 'undefined';
  } else if (typeof value !== 'string') {
    value = dbSerialize(value);
    if (!lang) {
      lang = 'json';
    }
  }
  value = maxLength(value, opts?.maxLength ?? 1500);
  if (opts?.forceLine !== "single" && (opts?.forceLine === "multi" || value.includes('\n'))) {
    return '```' + (lang ?? '') + '\n' + value + '\n```';
  } else {
    return '`' + value + '`';
  }
}
module.exports.wrapInCode = wrapInCode;

/**
 * 
 * @param {import("./channel").ChannelInfo} value The channel info
 * @param {{excludeParent?: boolean}} opts Additional options for formatting.
 * @returns {string} The formatted string.
 */
function channelInfoToString(value, opts = {}) {
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
module.exports.channelInfoToString = channelInfoToString;

function booleanToString(value, yesIsBad = false, yesStr = 'Yes', noStr = 'No') {
  return value ? (yesIsBad ? (':red_circle: ' + yesStr) : (':green_circle: ' + yesStr)) : (yesIsBad ? (':green_circle: ' + noStr) : (':red_circle: No' + noStr));
}
module.exports.booleanToString = booleanToString;

/**
 * @param {string} ms 
 */
function msToString(ms) {
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
module.exports.msToString = msToString;

/**
 * 
 * @param {any[] | false | null | undefined | string} list 
 * @param {string} emptyStr 
 * @returns {string}
 */
function stringList(list, emptyStr = 'None', joinStr = ', ') {
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
module.exports.stringList = stringList;

function ratioToString(value, total, digits = 2) {
  if (value === 0 || total === 0) {
    return (0).toFixed(digits) + '%';
  }
  return ((value / total) * 100).toFixed(digits) + '%';
}
module.exports.ratioToString = ratioToString;

const COLOR = {
  RESET: '\x1b[0m',
  DIM: "\x1b[2m",
  FG_MAGENTA: "\x1b[35m"
}
module.exports.COLOR = COLOR;
