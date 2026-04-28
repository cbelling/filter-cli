const { callOperation } = require('../client');
const { option, parseInteger } = require('../helpers');

module.exports = [
  {
    path: ['library', 'add'],
    operationId: 'addToLibrary',
    description: 'Add a feed item to the library.',
    safety: 'confirm',
    usage: 'filter library add --id <feed-item-id> --confirm',
    examples: ['filter library add --id 42 --confirm'],
    args: [{ flag: '--id', required: true, description: 'Feed item ID.' }],
    options: {
      id: option('string'),
    },
    async handler(context, values) {
      const itemId = parseInteger(values.id, 'id');
      await callOperation({
        operationId: 'addToLibrary',
        context: context.runtime,
        request: {
          path: { id: itemId },
        },
      });

      return {
        status: 'added',
        data: { id: itemId },
      };
    },
  },
];
