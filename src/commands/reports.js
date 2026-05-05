const { callOperation, CliError } = require('../client');
const {
  option,
  parseInteger,
  parseIntegerList,
  parseOptionalInteger,
  requireString,
  truncateText,
} = require('../helpers');

function normalizeGeneratedReport(payload, full) {
  const data = payload?.data && typeof payload.data === 'object' ? { ...payload.data } : {};
  let truncated = false;

  if (!full && typeof data.content === 'string') {
    const trimmed = truncateText(data.content, 1600);
    data.content = trimmed.value;
    truncated = trimmed.truncated;
  }

  return { data, truncated };
}

module.exports = [
  {
    path: ['reports', 'list'],
    operationId: 'listReports',
    description: 'List reports.',
    safety: 'auto',
    usage: 'filter reports list [--page <n>] [--view-id <id>] [--status <status>] [--report-type <type>]',
    examples: ['filter reports list --status ready'],
    args: [],
    options: {
      page: option('string'),
      'view-id': option('string'),
      status: option('string'),
      'report-type': option('string'),
    },
    async handler(context, values) {
      const response = await callOperation({
        operationId: 'listReports',
        context: context.runtime,
        request: {
          query: {
            page: parseOptionalInteger(values.page, 'page'),
            viewId: parseOptionalInteger(values['view-id'], 'view-id'),
            status: values.status,
            reportType: values['report-type'],
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
  {
    path: ['reports', 'create'],
    operationId: 'createReport',
    description: 'Create a new report.',
    safety: 'confirm',
    usage: 'filter reports create --title <title> [--view-id <id>] [--prompt <text>] [--report-type <type>] [--tone <tone>] [--confirm]',
    examples: [
      'filter reports create --title "Weekly AI digest" --view-id 3 --tone executive --confirm',
    ],
    args: [
      { flag: '--title', required: true, description: 'Report title.' },
      { flag: '--view-id', description: 'Optional view ID.' },
      { flag: '--prompt', description: 'Optional custom prompt.' },
      { flag: '--report-type', description: 'Report type.' },
      { flag: '--tone', description: 'Report tone.' },
      { flag: '--schedule-cron', description: 'Optional cron schedule.' },
      { flag: '--web-search-enabled', description: 'Enable web search during report generation.' },
      { flag: '--feed-item-id', description: 'Attach a feed item to the report. Repeat for multiple items.' },
      { flag: '--highlight-id', description: 'Attach a highlight to the report. Repeat for multiple highlights.' },
    ],
    options: {
      title: option('string'),
      'view-id': option('string'),
      prompt: option('string'),
      'report-type': option('string'),
      tone: option('string'),
      'schedule-cron': option('string'),
      'web-search-enabled': option('boolean'),
      'feed-item-id': option('string', { multiple: true }),
      'highlight-id': option('string', { multiple: true }),
    },
    async handler(context, values) {
      const response = await callOperation({
        operationId: 'createReport',
        context: context.runtime,
        request: {
          body: {
            title: requireString(values.title, 'title'),
            viewId: values['view-id'] ? parseInteger(values['view-id'], 'view-id') : undefined,
            prompt: values.prompt || undefined,
            reportType: values['report-type'] || undefined,
            scheduleCron: values['schedule-cron'] || undefined,
            tone: values.tone || undefined,
            webSearchEnabled: values['web-search-enabled'] ? true : undefined,
            feedItemIds: parseIntegerList(values['feed-item-id'], 'feed-item-id'),
            highlightIds: parseIntegerList(values['highlight-id'], 'highlight-id'),
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
    path: ['reports', 'generate'],
    operationId: 'generateReport',
    description: 'Generate report content.',
    safety: 'confirm',
    usage: 'filter reports generate --id <report-id> [--full] [--confirm]',
    examples: ['filter reports generate --id 8 --confirm'],
    args: [{ flag: '--id', required: true, description: 'Report ID.' }],
    options: {
      id: option('string'),
    },
    async handler(context, values) {
      const reportId = parseInteger(values.id, 'id');
      const response = await callOperation({
        operationId: 'generateReport',
        context: context.runtime,
        request: {
          path: { id: reportId },
        },
      });

      const normalized = normalizeGeneratedReport(response.payload, context.flags.full === true);
      return {
        status: 'generated',
        data: normalized.data,
        meta: {
          truncated: normalized.truncated,
        },
      };
    },
  },
  {
    path: ['reports', 'add-items'],
    operationId: 'addItemsToReport',
    description: 'Attach feed items or highlights to an existing report.',
    safety: 'confirm',
    usage: 'filter reports add-items --id <report-id> [--feed-item-id <id>]... [--highlight-id <id>]... [--confirm]',
    examples: ['filter reports add-items --id 8 --feed-item-id 42 --feed-item-id 43 --confirm'],
    args: [
      { flag: '--id', required: true, description: 'Report ID.' },
      { flag: '--feed-item-id', description: 'Feed item ID to attach. Repeat for multiple items.' },
      { flag: '--highlight-id', description: 'Highlight ID to attach. Repeat for multiple highlights.' },
    ],
    options: {
      id: option('string'),
      'feed-item-id': option('string', { multiple: true }),
      'highlight-id': option('string', { multiple: true }),
    },
    async handler(context, values) {
      const reportId = parseInteger(values.id, 'id');
      const feedItemIds = parseIntegerList(values['feed-item-id'], 'feed-item-id');
      const highlightIds = parseIntegerList(values['highlight-id'], 'highlight-id');
      if (!feedItemIds.length && !highlightIds.length) {
        throw new CliError('Provide at least one --feed-item-id or --highlight-id.', {
          code: 'validation',
          exitCode: 2,
        });
      }

      await callOperation({
        operationId: 'addItemsToReport',
        context: context.runtime,
        request: {
          path: { id: reportId },
          body: {
            feedItemIds,
            highlightIds,
          },
        },
      });

      return {
        status: 'updated',
        data: {
          id: reportId,
          feedItemIds,
          highlightIds,
        },
      };
    },
  },
];
