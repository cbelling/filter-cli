const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { COMMANDS } = require('../src/registry');

const EXPECTED_OPERATION_CONTRACTS = {
  listFeedItems: {
    method: 'GET',
    query: ['page', 'perPage', 'sort', 'source', 'q', 'read', 'state', 'saved', 'from', 'to', 'connectorId'],
  },
  getFeedItem: { method: 'GET', path: ['id'] },
  getItemReader: { method: 'GET', path: ['id'] },
  markFeedItemRead: { method: 'POST', path: ['id'] },
  markFeedItemUnread: { method: 'POST', path: ['id'] },
  saveFeedItem: { method: 'POST', path: ['id'] },
  unsaveFeedItem: { method: 'POST', path: ['id'] },
  archiveFeedItem: { method: 'POST', path: ['id'] },
  unarchiveFeedItem: { method: 'POST', path: ['id'] },
  addToLibrary: { method: 'POST', path: ['id'] },
  updateFeedItemTags: {
    method: 'PATCH',
    path: ['id'],
    body: ['tags', 'mode', 'createUnknown'],
  },
  listHighlights: {
    method: 'GET',
    query: ['source', 'topic', 'from', 'to', 'q'],
  },
  listSources: { method: 'GET' },
  listSourceItems: {
    method: 'GET',
    path: ['id'],
    query: ['page', 'sort', 'q', 'read', 'state', 'source'],
  },
  testSource: { method: 'POST', path: ['id'] },
  createSource: {
    method: 'POST',
    body: [
      'source',
      'configKey',
      'configJson',
      'feedUrl',
      'youtubeUrl',
      'subreddits',
      'usernames',
      'podcastTitle',
      'youtubeTitle',
      'enabled',
    ],
  },
  deleteSource: { method: 'DELETE', path: ['id'] },
  pauseSource: { method: 'POST', path: ['id'] },
  resumeSource: { method: 'POST', path: ['id'] },
  syncSource: { method: 'POST', path: ['id'] },
  listViews: { method: 'GET' },
  createView: {
    method: 'POST',
    body: ['name', 'description', 'icon', 'color', 'topicIds', 'topicNames', 'connectorIds', 'webSearchEnabled', 'isPinned'],
  },
  getViewFeed: {
    method: 'GET',
    path: ['id'],
    query: ['page', 'sort', 'q', 'read', 'state', 'source', 'progress'],
  },
  listReports: {
    method: 'GET',
    query: ['page', 'viewId', 'status', 'reportType'],
  },
  createReport: {
    method: 'POST',
    body: ['title', 'viewId', 'prompt', 'reportType', 'scheduleCron', 'tone', 'webSearchEnabled', 'feedItemIds', 'highlightIds'],
  },
  generateReport: { method: 'POST', path: ['id'] },
  addItemsToReport: {
    method: 'POST',
    path: ['id'],
    body: ['feedItemIds', 'highlightIds'],
  },
  discoverSources: {
    method: 'POST',
    body: ['text', 'images'],
  },
  parseFilterIntent: {
    method: 'POST',
    body: ['text'],
  },
  webSearch: {
    method: 'POST',
    body: ['query', 'allowedDomains', 'blockedDomains', 'maxUses'],
  },
  loginApiToken: {
    method: 'POST',
    body: ['email', 'password', 'deviceName', 'platform'],
  },
  logoutApiToken: { method: 'POST' },
  refreshApiToken: { method: 'POST' },
  getAuthUser: { method: 'GET' },
};

function loadSpec() {
  const specPath = path.resolve(__dirname, '..', 'openapi.json');
  return JSON.parse(fs.readFileSync(specPath, 'utf8'));
}

function buildOperationMap(spec) {
  const operations = new Map();

  for (const [pathname, methods] of Object.entries(spec.paths || {})) {
    for (const [method, operation] of Object.entries(methods || {})) {
      if (!operation?.operationId) continue;
      operations.set(operation.operationId, {
        method: String(method).toUpperCase(),
        pathname,
        parameters: Array.isArray(operation.parameters) ? operation.parameters : [],
        bodyProperties: Object.keys(operation.requestBody?.content?.['application/json']?.schema?.properties || {}),
      });
    }
  }

  return operations;
}

function commandOperationIds(command) {
  return [
    ...(command.operationId ? [command.operationId] : []),
    ...(command.operationIds || []),
  ];
}

function assertIncludesAll(actual, expected, message) {
  for (const value of expected || []) {
    assert.ok(actual.includes(value), `${message}: missing ${value}`);
  }
}

test('every API-backed CLI command has a matching OpenAPI contract', () => {
  const operations = buildOperationMap(loadSpec());

  for (const command of COMMANDS) {
    for (const operationId of commandOperationIds(command)) {
      const operation = operations.get(operationId);
      assert.ok(operation, `${command.path.join(' ')} is missing OpenAPI operation ${operationId}`);

      const expected = EXPECTED_OPERATION_CONTRACTS[operationId];
      assert.ok(expected, `${operationId} is missing CLI contract expectations`);
      assert.equal(operation.method, expected.method, `${operationId} method changed`);

      const requiredPathParams = operation.parameters
        .filter((parameter) => parameter.in === 'path' && parameter.required)
        .map((parameter) => parameter.name);
      const queryParams = operation.parameters
        .filter((parameter) => parameter.in === 'query')
        .map((parameter) => parameter.name);

      assertIncludesAll(requiredPathParams, expected.path, `${operationId} required path params changed`);
      assertIncludesAll(queryParams, expected.query, `${operationId} query params changed`);
      assertIncludesAll(operation.bodyProperties, expected.body, `${operationId} body properties changed`);
    }
  }
});
