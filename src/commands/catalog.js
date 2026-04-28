module.exports = [
  {
    path: ['catalog'],
    description: 'List the available CLI commands in a machine-readable format.',
    safety: 'auto',
    usage: 'filter catalog',
    examples: ['filter catalog'],
    args: [],
    options: {},
    async handler(context) {
      return {
        status: 'ok',
        data: context.catalog,
      };
    },
  },
];
