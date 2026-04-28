const { callOperation, CliError } = require('../client');
const {
  option,
  parseInteger,
  requireString,
  ensureOneOf,
} = require('../helpers');

module.exports = [
  {
    path: ['sources', 'list'],
    operationId: 'listSources',
    description: 'List content sources with status and stats.',
    safety: 'auto',
    usage: 'filter sources list',
    examples: ['filter sources list'],
    args: [],
    options: {},
    async handler(context) {
      const response = await callOperation({
        operationId: 'listSources',
        context: context.runtime,
      });

      return {
        status: 'ok',
        data: response.payload?.data || [],
      };
    },
  },
  {
    path: ['sources', 'items'],
    operationId: 'listSourceItems',
    description: 'List feed items imported by a specific source.',
    safety: 'auto',
    usage: 'filter sources items --id <source-id> [--page <n>] [--sort <sort>] [--q <query>]',
    examples: ['filter sources items --id 5 --page 1'],
    args: [{ flag: '--id', required: true, description: 'Source connector ID.' }],
    options: {
      id: option('string'),
      page: option('string'),
      sort: option('string'),
      q: option('string'),
      read: option('string'),
      state: option('string'),
      source: option('string'),
    },
    async handler(context, values) {
      const sourceId = parseInteger(values.id, 'id');
      const response = await callOperation({
        operationId: 'listSourceItems',
        context: context.runtime,
        request: {
          path: { id: sourceId },
          query: {
            page: values.page,
            sort: values.sort,
            q: values.q,
            read: values.read,
            state: values.state,
            source: values.source,
          },
        },
      });

      return {
        status: 'ok',
        data: {
          items: response.payload?.data || [],
          filters: response.payload?.filters || {},
        },
        meta: {
          pagination: response.payload?.pagination || null,
        },
      };
    },
  },
  {
    path: ['sources', 'test'],
    operationId: 'testSource',
    description: 'Test connection for a source.',
    safety: 'auto',
    usage: 'filter sources test --id <source-id>',
    examples: ['filter sources test --id 5'],
    args: [{ flag: '--id', required: true, description: 'Source connector ID.' }],
    options: {
      id: option('string'),
    },
    async handler(context, values) {
      const sourceId = parseInteger(values.id, 'id');
      const response = await callOperation({
        operationId: 'testSource',
        context: context.runtime,
        request: { path: { id: sourceId } },
      });

      return {
        status: 'ok',
        data: response.payload?.result || null,
      };
    },
  },
  {
    path: ['sources', 'create'],
    operationId: 'createSource',
    description: 'Create a new source connector.',
    safety: 'confirm',
    usage: 'filter sources create --source <x|reddit|rss|podcast|youtube> [--feed-url <url>|--youtube-url <url>|--subreddits <csv>|--usernames <csv>|--config-json <json>] [--confirm]',
    examples: [
      'filter sources create --source rss --feed-url https://example.com/feed.xml --confirm',
      'filter sources create --source x --usernames openai,verge --disabled --confirm',
    ],
    args: [
      { flag: '--source', required: true, description: 'Source type: x, reddit, rss, podcast, or youtube.' },
      { flag: '--feed-url', description: 'Feed URL for rss or podcast sources.' },
      { flag: '--youtube-url', description: 'YouTube channel, playlist, or video URL.' },
      { flag: '--subreddits', description: 'Comma-separated subreddit names.' },
      { flag: '--usernames', description: 'Comma-separated X usernames.' },
      { flag: '--config-key', description: 'Optional explicit source key.' },
      { flag: '--config-json', description: 'Optional raw JSON config object.' },
      { flag: '--podcast-title', description: 'Optional podcast title.' },
      { flag: '--youtube-title', description: 'Optional YouTube display title.' },
      { flag: '--disabled', description: 'Create the source disabled.' },
    ],
    options: {
      source: option('string'),
      'config-key': option('string'),
      'config-json': option('string'),
      'feed-url': option('string'),
      'youtube-url': option('string'),
      subreddits: option('string'),
      usernames: option('string'),
      'podcast-title': option('string'),
      'youtube-title': option('string'),
      disabled: option('boolean'),
    },
    async handler(context, values) {
      const source = requireString(values.source, 'source').toLowerCase();
      if (!['x', 'reddit', 'rss', 'podcast', 'youtube'].includes(source)) {
        throw new CliError('source must be one of x, reddit, rss, podcast, or youtube.', {
          code: 'validation',
          exitCode: 2,
        });
      }

      ensureOneOf(
        values,
        ['config-json', 'feed-url', 'youtube-url', 'subreddits', 'usernames'],
        'Provide one of --config-json, --feed-url, --youtube-url, --subreddits, or --usernames.'
      );

      const response = await callOperation({
        operationId: 'createSource',
        context: context.runtime,
        request: {
          body: {
            source,
            configKey: values['config-key'] || undefined,
            configJson: values['config-json'] || undefined,
            feedUrl: values['feed-url'] || undefined,
            youtubeUrl: values['youtube-url'] || undefined,
            subreddits: values.subreddits || undefined,
            usernames: values.usernames || undefined,
            podcastTitle: values['podcast-title'] || undefined,
            youtubeTitle: values['youtube-title'] || undefined,
            enabled: values.disabled ? false : true,
          },
        },
      });

      return {
        status: response.payload?.status || 'created',
        data: {
          id: response.payload?.id || null,
          source,
        },
      };
    },
  },
  {
    path: ['sources', 'delete'],
    operationId: 'deleteSource',
    description: 'Delete a source connector.',
    safety: 'confirm',
    usage: 'filter sources delete --id <source-id> --confirm',
    examples: ['filter sources delete --id 5 --confirm'],
    args: [{ flag: '--id', required: true, description: 'Source connector ID.' }],
    options: {
      id: option('string'),
    },
    async handler(context, values) {
      const sourceId = parseInteger(values.id, 'id');
      await callOperation({
        operationId: 'deleteSource',
        context: context.runtime,
        request: { path: { id: sourceId } },
      });

      return {
        status: 'deleted',
        data: { id: sourceId },
      };
    },
  },
  {
    path: ['sources', 'sync'],
    operationId: 'syncSource',
    description: 'Trigger a manual sync for a source connector.',
    safety: 'confirm',
    usage: 'filter sources sync --id <source-id> --confirm',
    examples: ['filter sources sync --id 5 --confirm'],
    args: [{ flag: '--id', required: true, description: 'Source connector ID.' }],
    options: {
      id: option('string'),
    },
    async handler(context, values) {
      const sourceId = parseInteger(values.id, 'id');
      const response = await callOperation({
        operationId: 'syncSource',
        context: context.runtime,
        request: { path: { id: sourceId } },
      });

      return {
        status: 'synced',
        data: response.payload?.result || null,
      };
    },
  },
  {
    path: ['sources', 'pause'],
    operationId: 'pauseSource',
    description: 'Pause a source connector.',
    safety: 'confirm',
    usage: 'filter sources pause --id <source-id> --confirm',
    examples: ['filter sources pause --id 5 --confirm'],
    args: [{ flag: '--id', required: true, description: 'Source connector ID.' }],
    options: {
      id: option('string'),
    },
    async handler(context, values) {
      const sourceId = parseInteger(values.id, 'id');
      await callOperation({
        operationId: 'pauseSource',
        context: context.runtime,
        request: { path: { id: sourceId } },
      });

      return {
        status: 'paused',
        data: { id: sourceId },
      };
    },
  },
  {
    path: ['sources', 'resume'],
    operationId: 'resumeSource',
    description: 'Resume a paused source connector.',
    safety: 'confirm',
    usage: 'filter sources resume --id <source-id> --confirm',
    examples: ['filter sources resume --id 5 --confirm'],
    args: [{ flag: '--id', required: true, description: 'Source connector ID.' }],
    options: {
      id: option('string'),
    },
    async handler(context, values) {
      const sourceId = parseInteger(values.id, 'id');
      await callOperation({
        operationId: 'resumeSource',
        context: context.runtime,
        request: { path: { id: sourceId } },
      });

      return {
        status: 'resumed',
        data: { id: sourceId },
      };
    },
  },
];
