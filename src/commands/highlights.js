const { callOperation } = require('../client');
const { option } = require('../helpers');

module.exports = [
  {
    path: ['highlights', 'list'],
    operationId: 'listHighlights',
    description: 'List highlights with optional source, topic, date, and search filters.',
    safety: 'auto',
    usage: 'filter highlights list [--source <source>] [--topic <topic>] [--from <date>] [--to <date>] [--q <query>]',
    examples: ['filter highlights list --topic AI --q summarization'],
    args: [
      { flag: '--source', description: 'Source type filter.' },
      { flag: '--topic', description: 'Topic filter.' },
      { flag: '--from', description: 'Start date in YYYY-MM-DD format.' },
      { flag: '--to', description: 'End date in YYYY-MM-DD format.' },
      { flag: '--q', description: 'Full-text query.' },
    ],
    options: {
      source: option('string'),
      topic: option('string'),
      from: option('string'),
      to: option('string'),
      q: option('string'),
    },
    async handler(context, values) {
      const response = await callOperation({
        operationId: 'listHighlights',
        context: context.runtime,
        request: {
          query: {
            source: values.source,
            topic: values.topic,
            from: values.from,
            to: values.to,
            q: values.q,
          },
        },
      });

      return {
        status: 'ok',
        data: response.payload?.data || [],
      };
    },
  },
];
