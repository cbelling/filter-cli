const { callOperation } = require('../client');
const {
  option,
  parseInteger,
  parseIntegerList,
  requireString,
} = require('../helpers');

module.exports = [
  {
    path: ['views', 'list'],
    operationId: 'listViews',
    description: 'List saved views.',
    safety: 'auto',
    usage: 'filter views list',
    examples: ['filter views list'],
    args: [],
    options: {},
    async handler(context) {
      const response = await callOperation({
        operationId: 'listViews',
        context: context.runtime,
      });

      return {
        status: 'ok',
        data: response.payload?.data || [],
      };
    },
  },
  {
    path: ['views', 'create'],
    operationId: 'createView',
    description: 'Create a new view.',
    safety: 'confirm',
    usage: 'filter views create --name <name> [--topic-name <topic>]... [--source-id <id>]... [--web-search-enabled] [--confirm]',
    examples: [
      'filter views create --name "AI Inbox" --topic-name AI --web-search-enabled --confirm',
    ],
    args: [
      { flag: '--name', required: true, description: 'View name.' },
      { flag: '--description', description: 'Optional view description.' },
      { flag: '--topic-name', description: 'Topic name to include. Repeat for multiple topics.' },
      { flag: '--topic-id', description: 'Existing topic ID to include. Repeat for multiple topics.' },
      { flag: '--source-id', description: 'Connector ID to include. Repeat for multiple sources.' },
      { flag: '--web-search-enabled', description: 'Enable web search enrichment for the view.' },
      { flag: '--pinned', description: 'Create the view pinned.' },
    ],
    options: {
      name: option('string'),
      description: option('string'),
      icon: option('string'),
      color: option('string'),
      'topic-name': option('string', { multiple: true }),
      'topic-id': option('string', { multiple: true }),
      'source-id': option('string', { multiple: true }),
      'web-search-enabled': option('boolean'),
      pinned: option('boolean'),
    },
    async handler(context, values) {
      const response = await callOperation({
        operationId: 'createView',
        context: context.runtime,
        request: {
          body: {
            name: requireString(values.name, 'name'),
            description: values.description || undefined,
            icon: values.icon || undefined,
            color: values.color || undefined,
            topicIds: parseIntegerList(values['topic-id'], 'topic-id'),
            topicNames: Array.isArray(values['topic-name']) ? values['topic-name'] : undefined,
            connectorIds: parseIntegerList(values['source-id'], 'source-id'),
            webSearchEnabled: values['web-search-enabled'] ? true : undefined,
            isPinned: values.pinned ? true : undefined,
          },
        },
      });

      return {
        status: 'created',
        data: response.payload?.data || null,
      };
    },
  },
  {
    path: ['views', 'feed'],
    operationId: 'getViewFeed',
    description: 'List feed items for a saved view.',
    safety: 'auto',
    usage: 'filter views feed --id <view-id> [--page <n>] [--sort <sort>] [--q <query>]',
    examples: ['filter views feed --id 3 --page 1'],
    args: [{ flag: '--id', required: true, description: 'View ID.' }],
    options: {
      id: option('string'),
      page: option('string'),
      sort: option('string'),
      q: option('string'),
      read: option('string'),
      state: option('string'),
      source: option('string'),
      progress: option('string'),
    },
    async handler(context, values) {
      const viewId = parseInteger(values.id, 'id');
      const response = await callOperation({
        operationId: 'getViewFeed',
        context: context.runtime,
        request: {
          path: { id: viewId },
          query: {
            page: values.page,
            sort: values.sort,
            q: values.q,
            read: values.read,
            state: values.state,
            source: values.source,
            progress: values.progress,
          },
        },
      });

      return {
        status: 'ok',
        data: response.payload?.data || [],
        meta: {
          pagination: response.payload?.pagination || null,
        },
      };
    },
  },
];
