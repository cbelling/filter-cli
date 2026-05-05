#!/usr/bin/env node

const { parseArgs } = require('node:util');
const { resolveRuntimeConfig } = require('./config');
const { CliError, DEFAULT_TIMEOUT_MS } = require('./client');
const { buildErrorEnvelope, buildSuccessEnvelope, writeEnvelope } = require('./output');
const { findCommand, formatCommandPath, getCatalogEntries, renderHelp } = require('./registry');

const GLOBAL_OPTION_DEFS = {
  json: { type: 'boolean' },
  pretty: { type: 'boolean' },
  'base-url': { type: 'string' },
  token: { type: 'string' },
  profile: { type: 'string' },
  timeout: { type: 'string' },
  confirm: { type: 'boolean' },
  full: { type: 'boolean' },
  help: { type: 'boolean' },
};

function extractGlobalArgs(args) {
  const remaining = [];
  const flags = {};

  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index];
    if (!raw.startsWith('--')) {
      remaining.push(raw);
      continue;
    }

    const eqIndex = raw.indexOf('=');
    const rawName = eqIndex >= 0 ? raw.slice(2, eqIndex) : raw.slice(2);
    const definition = GLOBAL_OPTION_DEFS[rawName];
    if (!definition) {
      remaining.push(raw);
      continue;
    }

    if (definition.type === 'boolean') {
      flags[rawName] = true;
      continue;
    }

    const inlineValue = eqIndex >= 0 ? raw.slice(eqIndex + 1) : null;
    if (inlineValue !== null) {
      flags[rawName] = inlineValue;
      continue;
    }

    const next = args[index + 1];
    if (typeof next !== 'string' || next.startsWith('--')) {
      throw new CliError(`--${rawName} requires a value.`, {
        code: 'validation',
        exitCode: 2,
      });
    }
    flags[rawName] = next;
    index += 1;
  }

  return { flags, remaining };
}

function resolveCommandTokens(remaining) {
  const commandTokens = [];
  for (const token of remaining) {
    if (token.startsWith('--')) break;
    commandTokens.push(token);
  }
  return commandTokens;
}

function parseCommandValues(command, args) {
  try {
    return parseArgs({
      args,
      options: command.options || {},
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    throw new CliError(String(error?.message || 'Invalid command arguments.'), {
      code: 'validation',
      exitCode: 2,
    });
  }
}

function resolveFlags(rawFlags) {
  const timeoutRaw = rawFlags.timeout;
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  if (timeoutRaw !== undefined) {
    const parsed = Number(timeoutRaw);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new CliError('--timeout must be a positive integer.', {
        code: 'validation',
        exitCode: 2,
      });
    }
    timeoutMs = parsed;
  }

  return {
    json: rawFlags.pretty ? false : true,
    pretty: rawFlags.pretty === true,
    baseUrl: rawFlags['base-url'],
    token: rawFlags.token,
    profile: rawFlags.profile,
    timeoutMs,
    confirm: rawFlags.confirm === true,
    full: rawFlags.full === true,
    help: rawFlags.help === true,
  };
}

function createPendingConfirmationEnvelope(command, flags, argv) {
  const rerunArgs = Array.isArray(argv) ? argv.filter((token) => token !== '--pretty') : [];
  if (!rerunArgs.includes('--confirm')) rerunArgs.push('--confirm');

  return buildErrorEnvelope({
    status: 'pending_confirmation',
    error: {
      code: 'confirmation_required',
      message: `Command "${formatCommandPath(command.path)}" requires --confirm.`,
    },
    meta: {
      command: command.path.join(' '),
      safety: command.safety,
      hint: `filter ${rerunArgs.join(' ')}`.trim(),
    },
  });
}

async function run(argv = process.argv.slice(2), io = {}) {
  const stdin = io.stdin || process.stdin;
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const env = io.env || process.env;
  let prettyErrors = false;

  try {
    const extracted = extractGlobalArgs(argv);
    const flags = resolveFlags(extracted.flags);
    prettyErrors = flags.pretty;
    const commandTokens = resolveCommandTokens(extracted.remaining);
    const command = findCommand(commandTokens);

    if (flags.help) {
      stdout.write(renderHelp(command));
      return 0;
    }

    if (!command) {
      if (!commandTokens.length) {
        stdout.write(renderHelp());
        return 0;
      }

      writeEnvelope(
        buildErrorEnvelope({
          status: 'error',
          error: {
            code: 'unknown_command',
            message: `Unknown command: ${commandTokens.join(' ')}`,
          },
          meta: {
            hint: 'Run `filter catalog` or `filter --help` to see available commands.',
          },
        }),
        { pretty: flags.pretty, stdout, stderr }
      );
      return 2;
    }

    const commandArgs = extracted.remaining.slice(command.path.length);
    const parsed = parseCommandValues(command, commandArgs);
    if (parsed.positionals.length) {
      throw new CliError(`Unexpected positional arguments: ${parsed.positionals.join(' ')}`, {
        code: 'validation',
        exitCode: 2,
      });
    }

    const runtime = resolveRuntimeConfig({
      flags: {
        baseUrl: flags.baseUrl,
        token: flags.token,
        profile: flags.profile,
      },
      env,
    });
    runtime.timeoutMs = flags.timeoutMs;
    runtime.env = env;

    const context = {
      env,
      flags,
      stdin,
      stdout,
      stderr,
      runtime,
      catalog: getCatalogEntries(),
    };

    if (command.safety === 'confirm' && !flags.confirm) {
      writeEnvelope(createPendingConfirmationEnvelope(command, flags, argv), {
        pretty: flags.pretty,
        stdout,
        stderr,
      });
      return 5;
    }

    const result = await command.handler(context, parsed.values || {});
    const envelope = buildSuccessEnvelope({
      status: result?.status || 'ok',
      data: result?.data ?? null,
      meta: {
        command: command.path.join(' '),
        safety: command.safety,
        profile: runtime.profileName,
        baseUrl: runtime.baseUrl,
        ...(result?.meta || {}),
      },
    });

    writeEnvelope(envelope, {
      pretty: flags.pretty,
      stdout,
      stderr,
    });
    return 0;
  } catch (error) {
    const cliError = error instanceof CliError
      ? error
      : new CliError(String(error?.message || 'Command failed.'), {
          code: 'command_failed',
          exitCode: 6,
        });

    writeEnvelope(
      buildErrorEnvelope({
        status: cliError.code === 'missing_token' ? 'auth_required' : 'error',
        error: {
          code: cliError.code,
          message: cliError.message,
          details: cliError.details,
          httpStatus: cliError.httpStatus,
        },
      }),
      {
        pretty: prettyErrors,
        stdout,
        stderr,
      }
    );
    return cliError.exitCode;
  }
}

if (require.main === module) {
  run().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

module.exports = {
  extractGlobalArgs,
  parseCommandValues,
  resolveFlags,
  run,
};
