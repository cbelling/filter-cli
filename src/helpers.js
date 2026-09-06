const { CliError } = require('./client');

function option(type, config = {}) {
  return { type, ...config };
}

function cleanString(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.trim();
}

function requireString(value, label) {
  const normalized = cleanString(value);
  if (!normalized) {
    throw new CliError(`${label} is required.`, {
      code: 'validation',
      exitCode: 2,
    });
  }
  return normalized;
}

function parseInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Math.trunc(parsed) !== parsed || parsed < 1) {
    throw new CliError(`${label} must be a positive integer.`, {
      code: 'validation',
      exitCode: 2,
    });
  }
  return parsed;
}

function parseOptionalInteger(value, label) {
  if (value === undefined || value === null || value === '') return undefined;
  return parseInteger(value, label);
}

function parseOptionalIntegerRange(value, label, bounds = {}) {
  if (value === undefined || value === null || value === '') return undefined;
  const { min = 1, max = Number.MAX_SAFE_INTEGER } = bounds;
  const parsed = parseInteger(value, label);
  if (parsed < min || parsed > max) {
    throw new CliError(`${label} must be an integer between ${min} and ${max}.`, {
      code: 'validation',
      exitCode: 2,
    });
  }
  return parsed;
}

function parseIntegerList(values, label) {
  const list = Array.isArray(values) ? values : values ? [values] : [];
  return list.map((value) => parseInteger(value, label));
}

function ensureOneOf(values, keys, message) {
  const found = keys.filter((key) => {
    const value = values[key];
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== null && value !== '';
  });
  if (!found.length) {
    throw new CliError(message, {
      code: 'validation',
      exitCode: 2,
    });
  }
}

function truncateText(value, limit) {
  const normalized = typeof value === 'string' ? value : '';
  if (!limit || normalized.length <= limit) {
    return {
      value: normalized,
      truncated: false,
      originalLength: normalized.length,
    };
  }

  return {
    value: `${normalized.slice(0, Math.max(limit - 3, 0))}...`,
    truncated: true,
    originalLength: normalized.length,
  };
}

module.exports = {
  cleanString,
  ensureOneOf,
  option,
  parseInteger,
  parseIntegerList,
  parseOptionalInteger,
  parseOptionalIntegerRange,
  requireString,
  truncateText,
};
