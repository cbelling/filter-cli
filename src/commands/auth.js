const { callOperation, CliError } = require('../client');
const { saveProfile, clearProfileToken } = require('../config');
const { option, requireString } = require('../helpers');
const { prompt } = require('../prompt');

const TOKEN_MIN_LENGTH = 32;

function settingsUrl(baseUrl) {
  const trimmed = String(baseUrl || '').replace(/\/+$/, '');
  return `${trimmed}/settings/api-keys`;
}

function tokenSavedPayload(saved, extra = {}) {
  return {
    tokenSaved: true,
    profile: saved.profileName,
    configPath: saved.configPath,
    ...extra,
  };
}

async function loginWithToken({ context, token }) {
  const validated = requireString(token, 'token');
  if (validated.length < TOKEN_MIN_LENGTH) {
    throw new CliError(
      `Token looks too short (got ${validated.length} chars). Make sure you copied the full value.`,
      { code: 'validation', exitCode: 2 }
    );
  }

  // Verify the token by hitting /auth/me before persisting it.
  const verifyContext = { ...context.runtime, token: validated };
  const response = await callOperation({
    operationId: 'getAuthUser',
    context: verifyContext,
  });

  const saved = saveProfile(
    context.runtime.profileName,
    { token: validated, baseUrl: context.runtime.baseUrl },
    context.env
  );

  return {
    status: 'authenticated',
    data: tokenSavedPayload(saved, {
      user: response.payload?.user || null,
    }),
  };
}

async function loginWithPassword({ context, values }) {
  const response = await callOperation({
    operationId: 'loginApiToken',
    authRequired: false,
    context: context.runtime,
    request: {
      body: {
        email: requireString(values.email, 'email'),
        password: requireString(values.password, 'password'),
        deviceName: values['device-name'] || null,
        platform: values.platform || 'cli',
      },
    },
  });

  const payload = response.payload || {};
  const token = requireString(payload.token, 'token');
  const saved = saveProfile(
    context.runtime.profileName,
    { token, baseUrl: context.runtime.baseUrl },
    context.env
  );

  return {
    status: 'authenticated',
    data: tokenSavedPayload(saved, {
      expiresAt: payload.expiresAt || null,
      user: payload.user || null,
    }),
  };
}

module.exports = [
  {
    path: ['auth', 'login'],
    operationIds: ['getAuthUser', 'loginApiToken'],
    description: 'Authenticate the CLI. Prompts for a token by default; --token or --email/--password also supported.',
    safety: 'auto',
    usage: 'filter auth login [--token <token>] [--email <email> --password <password>] [--device-name <name>] [--platform <platform>]',
    examples: [
      'filter auth login',
      'filter auth login --token YOUR_TOKEN',
      'filter auth login --email you@example.com --password hunter2',
    ],
    args: [
      { flag: '--token', description: 'Bearer token to save (skips the interactive prompt). Also a global flag.' },
      { flag: '--email', description: 'Email address for password login (power-user fallback).' },
      { flag: '--password', description: 'Password for email login.' },
      { flag: '--device-name', description: 'Optional device label stored with the token (email login only).' },
      { flag: '--platform', description: 'Optional platform label stored with the token (email login only).' },
    ],
    options: {
      email: option('string'),
      password: option('string'),
      'device-name': option('string'),
      platform: option('string'),
    },
    async handler(context, values) {
      // --token is a global flag, so it lands on context.runtime.token.
      const passedToken = context.runtime.token;
      if (passedToken) {
        return loginWithToken({ context, token: passedToken });
      }

      // Email/password: power-user fallback.
      if (values.email || values.password) {
        return loginWithPassword({ context, values });
      }

      // Default: interactive token prompt. The blessed flow.
      const url = settingsUrl(context.runtime.baseUrl);
      context.stderr.write(`\nOpen ${url} to generate a token, then paste it here.\n`);
      const pasted = await prompt('Token: ', {
        input: context.stdin,
        stream: context.stderr,
      });
      return loginWithToken({ context, token: pasted });
    },
  },
  {
    path: ['auth', 'whoami'],
    operationId: 'getAuthUser',
    description: 'Show the authenticated user for the current token.',
    safety: 'auto',
    usage: 'filter auth whoami',
    examples: ['filter auth whoami'],
    args: [],
    options: {},
    async handler(context) {
      const response = await callOperation({
        operationId: 'getAuthUser',
        context: context.runtime,
      });

      return {
        status: 'ok',
        data: response.payload?.user || null,
      };
    },
  },
  {
    path: ['auth', 'refresh'],
    operationId: 'refreshApiToken',
    description: 'Refresh the current bearer token and save the replacement token.',
    safety: 'auto',
    usage: 'filter auth refresh',
    examples: ['filter auth refresh'],
    args: [],
    options: {},
    async handler(context) {
      const response = await callOperation({
        operationId: 'refreshApiToken',
        context: context.runtime,
      });

      const payload = response.payload || {};
      const token = requireString(payload.token, 'token');
      const saved = saveProfile(
        context.runtime.profileName,
        { token, baseUrl: context.runtime.baseUrl },
        context.env
      );

      return {
        status: 'refreshed',
        data: tokenSavedPayload(saved, {
          expiresAt: payload.expiresAt || null,
        }),
      };
    },
  },
  {
    path: ['auth', 'logout'],
    operationId: 'logoutApiToken',
    description: 'Revoke the current bearer token and clear the saved token for the active profile.',
    safety: 'auto',
    usage: 'filter auth logout',
    examples: ['filter auth logout'],
    args: [],
    options: {},
    async handler(context) {
      await callOperation({
        operationId: 'logoutApiToken',
        context: context.runtime,
      });

      const cleared = clearProfileToken(context.runtime.profileName, context.env);
      return {
        status: 'logged_out',
        data: {
          profile: cleared.profileName,
          configPath: cleared.configPath,
        },
      };
    },
  },
  {
    path: ['auth', 'use-token'],
    description: 'Save an existing bearer token into the active profile without calling the API.',
    safety: 'auto',
    usage: 'filter auth use-token --token <token>',
    examples: ['filter auth use-token --token YOUR_TOKEN'],
    args: [
      { flag: '--token', required: true, description: 'Bearer token to save into the selected profile.' },
    ],
    options: {},
    async handler(context) {
      const token = String(context.runtime.token || '').trim();
      if (!token) {
        throw new CliError('A bearer token is required. Pass `--token` or set FILTER_API_TOKEN.', {
          code: 'validation',
          exitCode: 2,
        });
      }

      const saved = saveProfile(
        context.runtime.profileName,
        { token, baseUrl: context.runtime.baseUrl },
        context.env
      );

      return {
        status: 'saved',
        data: tokenSavedPayload(saved, {
          baseUrl: saved.profile.baseUrl,
        }),
      };
    },
  },
];
