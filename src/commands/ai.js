const { callOperation } = require('../client');
const { option, requireString } = require('../helpers');

module.exports = [
  {
    path: ['ai', 'discover-sources'],
    operationId: 'discoverSources',
    description: 'Discover candidate sources from text and optional images.',
    safety: 'auto',
    usage: 'filter ai discover-sources [--text <text>] [--image <path-or-url>]...',
    examples: ['filter ai discover-sources --text "https://youtube.com/@openai https://reddit.com/r/MachineLearning"'],
    args: [
      { flag: '--text', description: 'Free text to scan for source candidates.' },
      { flag: '--image', description: 'Optional image URL or path token. Repeat for multiple images.' },
    ],
    options: {
      text: option('string'),
      image: option('string', { multiple: true }),
    },
    async handler(context, values) {
      const response = await callOperation({
        operationId: 'discoverSources',
        context: context.runtime,
        request: {
          body: {
            text: values.text || '',
            images: Array.isArray(values.image) ? values.image : [],
          },
        },
      });

      return {
        status: 'ok',
        data: response.payload?.data || null,
      };
    },
  },
  {
    path: ['ai', 'parse-filter'],
    operationId: 'parseFilterIntent',
    description: 'Parse a natural-language filter request into structured feed filters.',
    safety: 'auto',
    usage: 'filter ai parse-filter --text <query>',
    examples: ['filter ai parse-filter --text "Unread podcast episodes about AI from this month"'],
    args: [{ flag: '--text', required: true, description: 'Natural-language filter request.' }],
    options: {
      text: option('string'),
    },
    async handler(context, values) {
      const response = await callOperation({
        operationId: 'parseFilterIntent',
        context: context.runtime,
        request: {
          body: {
            text: requireString(values.text, 'text'),
          },
        },
      });

      return {
        status: 'ok',
        data: response.payload?.data || null,
      };
    },
  },
  {
    path: ['ai', 'web-search'],
    operationId: 'webSearch',
    description: 'Run a cited web search for up-to-date information.',
    safety: 'auto',
    usage: 'filter ai web-search --query <query> [--allowed-domain <domain>]... [--blocked-domain <domain>]... [--max-uses <n>]',
    examples: ['filter ai web-search --query "latest OpenAI API pricing" --allowed-domain openai.com'],
    args: [
      { flag: '--query', required: true, description: 'Search query.' },
      { flag: '--allowed-domain', description: 'Restrict results to these domains. Repeat for multiple domains.' },
      { flag: '--blocked-domain', description: 'Exclude these domains. Repeat for multiple domains.' },
      { flag: '--max-uses', description: 'Maximum Tavily result count, up to 8.' },
    ],
    options: {
      query: option('string'),
      'allowed-domain': option('string', { multiple: true }),
      'blocked-domain': option('string', { multiple: true }),
      'max-uses': option('string'),
    },
    async handler(context, values) {
      const response = await callOperation({
        operationId: 'webSearch',
        context: context.runtime,
        request: {
          body: {
            query: requireString(values.query, 'query'),
            allowedDomains: Array.isArray(values['allowed-domain']) ? values['allowed-domain'] : undefined,
            blockedDomains: Array.isArray(values['blocked-domain']) ? values['blocked-domain'] : undefined,
            maxUses: values['max-uses'] ? Number(values['max-uses']) : undefined,
          },
        },
      });

      return {
        status: 'ok',
        data: response.payload?.data || null,
      };
    },
  },
];
