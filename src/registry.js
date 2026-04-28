const authCommands = require('./commands/auth');
const feedCommands = require('./commands/feed');
const highlightCommands = require('./commands/highlights');
const sourceCommands = require('./commands/sources');
const viewCommands = require('./commands/views');
const reportCommands = require('./commands/reports');
const libraryCommands = require('./commands/library');
const aiCommands = require('./commands/ai');
const catalogCommands = require('./commands/catalog');

const COMMANDS = [
  ...catalogCommands,
  ...authCommands,
  ...feedCommands,
  ...highlightCommands,
  ...sourceCommands,
  ...viewCommands,
  ...reportCommands,
  ...libraryCommands,
  ...aiCommands,
];

function formatCommandPath(path) {
  return `filter ${path.join(' ')}`.trim();
}

function getCatalogEntries() {
  return COMMANDS.map((entry) => ({
    command: entry.path.join(' '),
    usage: entry.usage,
    description: entry.description,
    safety: entry.safety,
    operationId: entry.operationId || null,
    operationIds: entry.operationIds || null,
    args: entry.args || [],
    examples: entry.examples || [],
  }));
}

function findCommand(tokens = []) {
  const normalized = Array.isArray(tokens) ? tokens : [];
  let best = null;

  for (const entry of COMMANDS) {
    if (entry.path.length > normalized.length) continue;
    const matches = entry.path.every((segment, index) => normalized[index] === segment);
    if (!matches) continue;
    if (!best || entry.path.length > best.path.length) {
      best = entry;
    }
  }

  return best;
}

function renderHelp(command = null) {
  if (command) {
    const lines = [
      command.usage,
      '',
      command.description,
    ];

    if (Array.isArray(command.args) && command.args.length) {
      lines.push('', 'Arguments:');
      for (const arg of command.args) {
        const required = arg.required ? ' (required)' : '';
        lines.push(`  ${arg.flag}${required}  ${arg.description || ''}`.trimEnd());
      }
    }

    if (Array.isArray(command.examples) && command.examples.length) {
      lines.push('', 'Examples:');
      for (const example of command.examples) {
        lines.push(`  ${example}`);
      }
    }

    return `${lines.join('\n')}\n`;
  }

  const lines = [
    'Usage:',
    '  filter <group> <command> [options]',
    '  filter catalog',
    '',
    'Global flags:',
    '  --json           Emit JSON output (default).',
    '  --pretty         Emit human-readable output.',
    '  --base-url       Override the API base URL.',
    '  --token          Override the bearer token.',
    '  --profile        Select a saved profile.',
    '  --timeout        Request timeout in milliseconds.',
    '  --confirm        Allow confirm-gated write commands to execute.',
    '  --full           Request full content instead of previews where supported.',
    '',
    'Commands:',
  ];

  for (const entry of COMMANDS) {
    lines.push(`  ${formatCommandPath(entry.path)}  ${entry.description}`);
  }

  lines.push('', 'Run `filter catalog` for machine-readable discovery.');
  return `${lines.join('\n')}\n`;
}

module.exports = {
  COMMANDS,
  findCommand,
  formatCommandPath,
  getCatalogEntries,
  renderHelp,
};
