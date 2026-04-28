const { callOperation, CliError } = require('../client');
const { saveProfile, clearProfileToken } = require('../config');
const { option, requireString } = require('../helpers');

module.exports = [
  {
    path: ['auth', 'login'],
    operationId: 'loginApiToken',
    description: 'Create and save a bearer token using email and password.',
    safety: 'auto',
    usage: 'filter auth login --email <email> --password <password> [--device-name <name>] [--platform <platform>]',
    examples: [
      'filter auth login --email you@example.com --password hunter2',
    ],
    args: [
      { flag: '--email', required: true, description: 'Email address for password login.' },
      { flag: '--password', required: true, description: 'Password for the account.' },
      { flag: '--device-name', description: 'Optional device label stored with the token.' },
      { flag: '--platform', description: 'Optional platform label stored with the token.' },
    ],
    options: {
      email: option('string'),
      password: option('string'),
      'device-name': option('string'),
      platform: option('string'),
    },
    async handler(context, values) {
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
        data: {
          token,
          expiresAt: payload.expiresAt || null,
          user: payload.user || null,
          profile: saved.profileName,
          configPath: saved.configPath,
        },
      };
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
        data: {
          token,
          expiresAt: payload.expiresAt || null,
          profile: saved.profileName,
          configPath: saved.configPath,
        },
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
        data: {
          profile: saved.profileName,
          baseUrl: saved.profile.baseUrl,
          configPath: saved.configPath,
        },
      };
    },
  },
];
