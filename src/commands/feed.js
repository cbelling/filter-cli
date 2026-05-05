const { callOperation, CliError } = require('../client');
const {
  cleanString,
  option,
  requireString,
  parseInteger,
  parseOptionalInteger,
  truncateText,
} = require('../helpers');

const STATE_OPERATION_BY_ACTION = {
  read: 'markFeedItemRead',
  unread: 'markFeedItemUnread',
  save: 'saveFeedItem',
  unsave: 'unsaveFeedItem',
  archive: 'archiveFeedItem',
  unarchive: 'unarchiveFeedItem',
};

function normalizeReaderPayload(payload, full) {
  const data = payload?.data || {};
  const article = data.article && typeof data.article === 'object' ? { ...data.article } : {};
  let truncated = false;

  if (!full) {
    if (typeof article.text_content === 'string') {
      const trimmed = truncateText(article.text_content, 1200);
      article.text_content = trimmed.value;
      truncated = truncated || trimmed.truncated;
    }
    if (typeof article.content_html === 'string') {
      const trimmed = truncateText(article.content_html, 2400);
      article.content_html = trimmed.value;
      truncated = truncated || trimmed.truncated;
    }
  }

  return {
    data: {
      ...data,
      article,
    },
    truncated,
  };
}

module.exports = [
  {
    path: ['feed', 'list'],
    operationId: 'listFeedItems',
    description: 'List feed items with filters and pagination.',
    safety: 'auto',
    usage: 'filter feed list [--page <n>] [--per-page <n>] [--source <source>] [--read <state>] [--state <state>] [--q <query>]',
    examples: [
      'filter feed list --source rss --read unread --page 1',
    ],
    args: [
      { flag: '--page', description: 'Page number.' },
      { flag: '--per-page', description: 'Items per page.' },
      { flag: '--source', description: 'Source type filter.' },
      { flag: '--read', description: 'Read filter: all, unread, or read.' },
      { flag: '--state', description: 'State filter: active, saved, archived, or all.' },
      { flag: '--sort', description: 'Sort order.' },
      { flag: '--q', description: 'Full-text query.' },
      { flag: '--from', description: 'Start date in YYYY-MM-DD format.' },
      { flag: '--to', description: 'End date in YYYY-MM-DD format.' },
      { flag: '--connector-id', description: 'Filter to one connector.' },
    ],
    options: {
      page: option('string'),
      'per-page': option('string'),
      source: option('string'),
      read: option('string'),
      state: option('string'),
      sort: option('string'),
      q: option('string'),
      from: option('string'),
      to: option('string'),
      'connector-id': option('string'),
    },
    async handler(context, values) {
      const response = await callOperation({
        operationId: 'listFeedItems',
        context: context.runtime,
        request: {
          query: {
            page: parseOptionalInteger(values.page, 'page'),
            perPage: parseOptionalInteger(values['per-page'], 'per-page'),
            source: values.source,
            read: values.read,
            state: values.state,
            sort: values.sort,
            q: values.q,
            from: values.from,
            to: values.to,
            connectorId: parseOptionalInteger(values['connector-id'], 'connector-id'),
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
    path: ['feed', 'get'],
    operationId: 'getFeedItem',
    description: 'Fetch a single feed item by ID.',
    safety: 'auto',
    usage: 'filter feed get --id <feed-item-id>',
    examples: ['filter feed get --id 42'],
    args: [{ flag: '--id', required: true, description: 'Feed item ID.' }],
    options: {
      id: option('string'),
    },
    async handler(context, values) {
      const itemId = parseInteger(values.id, 'id');
      const response = await callOperation({
        operationId: 'getFeedItem',
        context: context.runtime,
        request: {
          path: { id: itemId },
        },
      });

      return {
        status: 'ok',
        data: response.payload?.data || null,
      };
    },
  },
  {
    path: ['feed', 'reader'],
    operationId: 'getItemReader',
    description: 'Fetch extracted reader content for a feed item.',
    safety: 'auto',
    usage: 'filter feed reader --id <feed-item-id> [--full]',
    examples: ['filter feed reader --id 42', 'filter feed reader --id 42 --full'],
    args: [{ flag: '--id', required: true, description: 'Feed item ID.' }],
    options: {
      id: option('string'),
    },
    async handler(context, values) {
      const itemId = parseInteger(values.id, 'id');
      const response = await callOperation({
        operationId: 'getItemReader',
        context: context.runtime,
        request: {
          path: { id: itemId },
        },
      });

      const normalized = normalizeReaderPayload(response.payload, context.flags.full === true);
      return {
        status: 'ok',
        data: normalized.data,
        meta: {
          truncated: normalized.truncated,
        },
      };
    },
  },
  {
    path: ['feed', 'state'],
    operationIds: Object.values(STATE_OPERATION_BY_ACTION),
    description: 'Apply a single state transition to a feed item.',
    safety: 'confirm',
    usage: 'filter feed state --id <feed-item-id> --action <read|unread|save|unsave|archive|unarchive> [--confirm]',
    examples: ['filter feed state --id 42 --action archive --confirm'],
    args: [
      { flag: '--id', required: true, description: 'Feed item ID.' },
      { flag: '--action', required: true, description: 'State transition to apply.' },
    ],
    options: {
      id: option('string'),
      action: option('string'),
    },
    async handler(context, values) {
      const itemId = parseInteger(values.id, 'id');
      const action = requireString(values.action, 'action').toLowerCase();
      const operationId = STATE_OPERATION_BY_ACTION[action];
      if (!operationId) {
        throw new CliError('action must be one of read, unread, save, unsave, archive, or unarchive.', {
          code: 'validation',
          exitCode: 2,
        });
      }

      const response = await callOperation({
        operationId,
        context: context.runtime,
        request: {
          path: { id: itemId },
        },
      });

      return {
        status: response.payload?.status || 'updated',
        data: {
          itemId,
          action,
        },
      };
    },
  },
  {
    path: ['feed', 'tags'],
    operationId: 'updateFeedItemTags',
    description: 'Add, remove, or replace topic tags on a feed item using tag names.',
    safety: 'confirm',
    usage: 'filter feed tags --id <feed-item-id> [--tag <name>]... [--mode <add|remove|set>] [--strict-existing] [--confirm]',
    examples: [
      'filter feed tags --id 42 --tag AI --tag Research --mode add --confirm',
      'filter feed tags --id 42 --mode set --confirm',
    ],
    args: [
      { flag: '--id', required: true, description: 'Feed item ID.' },
      { flag: '--tag', description: 'Tag name to apply. Repeat for multiple tags.' },
      { flag: '--mode', description: 'Mutation mode: add, remove, or set.' },
      { flag: '--strict-existing', description: 'Do not create unknown tags automatically.' },
    ],
    options: {
      id: option('string'),
      tag: option('string', { multiple: true }),
      mode: option('string'),
      'strict-existing': option('boolean'),
    },
    async handler(context, values) {
      const itemId = parseInteger(values.id, 'id');
      const tags = Array.isArray(values.tag)
        ? values.tag.map((value) => cleanString(value)).filter(Boolean)
        : [];

      const response = await callOperation({
        operationId: 'updateFeedItemTags',
        context: context.runtime,
        request: {
          path: { id: itemId },
          body: {
            tags,
            mode: cleanString(values.mode, 'add') || 'add',
            createUnknown: values['strict-existing'] ? false : true,
          },
        },
      });

      return {
        status: response.payload?.status || 'updated',
        data: response.payload?.data || null,
      };
    },
  },
];
