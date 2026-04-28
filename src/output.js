function buildSuccessEnvelope({ status = 'ok', data = null, meta = {} }) {
  return {
    ok: true,
    status,
    data,
    error: null,
    meta,
  };
}

function buildErrorEnvelope({ status = 'error', error, meta = {} }) {
  return {
    ok: false,
    status,
    data: null,
    error,
    meta,
  };
}

function formatPrettyValue(value, indent = '') {
  if (value === null || value === undefined) return `${indent}(none)`;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return `${indent}${value}`;
  }
  return `${indent}${JSON.stringify(value, null, 2)}`;
}

function formatPrettyEnvelope(envelope) {
  if (!envelope.ok) {
    const lines = [`Status: ${envelope.status}`];
    if (envelope.error?.message) lines.push(`Error: ${envelope.error.message}`);
    if (envelope.error?.code) lines.push(`Code: ${envelope.error.code}`);
    if (envelope.meta?.hint) lines.push(`Hint: ${envelope.meta.hint}`);
    return `${lines.join('\n')}\n`;
  }

  const lines = [`Status: ${envelope.status}`];
  if (envelope.meta?.command) lines.push(`Command: ${envelope.meta.command}`);
  if (envelope.meta?.safety) lines.push(`Safety: ${envelope.meta.safety}`);

  if (envelope.data !== null && envelope.data !== undefined) {
    lines.push('Data:');
    lines.push(formatPrettyValue(envelope.data, '  '));
  }

  if (envelope.meta?.pagination) {
    lines.push('Pagination:');
    lines.push(formatPrettyValue(envelope.meta.pagination, '  '));
  }

  return `${lines.join('\n')}\n`;
}

function writeEnvelope(envelope, { pretty = false, stdout = process.stdout, stderr = process.stderr } = {}) {
  const serialized = pretty
    ? formatPrettyEnvelope(envelope)
    : `${JSON.stringify(envelope, null, 2)}\n`;

  if (envelope.ok) {
    stdout.write(serialized);
  } else {
    stderr.write(serialized);
  }
}

module.exports = {
  buildErrorEnvelope,
  buildSuccessEnvelope,
  writeEnvelope,
};
