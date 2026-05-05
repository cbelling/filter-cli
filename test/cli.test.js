const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { run } = require('../src/index');
const { getConfigPath, readConfig } = require('../src/config');

function createBufferWriter() {
  let value = '';
  return {
    stream: {
      write(chunk) {
        value += String(chunk);
      },
    },
    read() {
      return value;
    },
  };
}

function createJsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        if (String(name).toLowerCase() === 'content-type') return 'application/json; charset=utf-8';
        return null;
      },
    },
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    },
  };
}

async function runCli(args, { env, fetchImpl, stdin = process.stdin }) {
  const stdout = createBufferWriter();
  const stderr = createBufferWriter();
  const originalFetch = global.fetch;
  global.fetch = fetchImpl;

  try {
    const exitCode = await run(args, {
      stdout: stdout.stream,
      stderr: stderr.stream,
      stdin,
      env,
    });

    return {
      exitCode,
      stdout: stdout.read(),
      stderr: stderr.read(),
    };
  } finally {
    global.fetch = originalFetch;
  }
}

function createFetchQueue(assertions) {
  let callIndex = 0;

  return async (url, options = {}) => {
    const current = assertions[callIndex];
    assert.ok(current, `Unexpected fetch call #${callIndex + 1}: ${String(url)}`);
    callIndex += 1;

    if (current.url) {
      assert.equal(String(url), current.url);
    }
    if (current.method) {
      assert.equal(options.method, current.method);
    }
    if (typeof current.assert === 'function') {
      current.assert(url, options);
    }

    return createJsonResponse(current.status || 200, current.payload || { ok: true });
  };
}

function createEnv(tempDir, extra = {}) {
  return {
    ...process.env,
    XDG_CONFIG_HOME: tempDir,
    FILTER_API_BASE_URL: 'http://localhost:3000',
    FILTER_OPENAPI_PATH: path.resolve(__dirname, '..', 'openapi.json'),
    ...extra,
  };
}

test('catalog returns machine-readable command metadata', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filter-cli-catalog-'));
  const env = createEnv(tempDir);

  const result = await runCli(['catalog'], {
    env,
    fetchImpl: async () => {
      throw new Error('catalog should not call fetch');
    },
  });

  assert.equal(result.exitCode, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.ok(Array.isArray(payload.data));
  assert.ok(payload.data.some((entry) => entry.command === 'feed list'));
  assert.ok(payload.data.some((entry) => entry.command === 'auth login'));
});

test('auth login, refresh, and logout manage the saved profile token', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filter-cli-auth-'));
  const env = createEnv(tempDir);
  const fetchImpl = createFetchQueue([
    {
      url: 'http://localhost:3000/api/auth/login',
      method: 'POST',
      assert(_url, options) {
        const body = JSON.parse(String(options.body));
        assert.equal(body.email, 'person@example.com');
        assert.equal(body.password, 'secret');
      },
      payload: {
        ok: true,
        token: 'token-one',
        expiresAt: '2030-01-01T00:00:00.000Z',
        user: { id: 1, email: 'person@example.com' },
      },
    },
    {
      url: 'http://localhost:3000/api/auth/refresh',
      method: 'POST',
      assert(_url, options) {
        assert.equal(options.headers.Authorization, 'Bearer token-one');
      },
      payload: {
        ok: true,
        token: 'token-two',
        expiresAt: '2030-02-01T00:00:00.000Z',
      },
    },
    {
      url: 'http://localhost:3000/api/auth/logout',
      method: 'POST',
      assert(_url, options) {
        assert.equal(options.headers.Authorization, 'Bearer token-two');
      },
      payload: { ok: true },
    },
  ]);

  const loginResult = await runCli(
    ['auth', 'login', '--email', 'person@example.com', '--password', 'secret'],
    { env, fetchImpl }
  );
  assert.equal(loginResult.exitCode, 0);
  assert.doesNotMatch(loginResult.stdout, /token-one/);
  const loginPayload = JSON.parse(loginResult.stdout);
  assert.equal(loginPayload.data.tokenSaved, true);
  assert.equal(loginPayload.data.profile, 'default');

  let config = readConfig(env);
  assert.equal(config.profiles.default.token, 'token-one');
  const configPath = getConfigPath(env);
  const mode = fs.statSync(configPath).mode & 0o777;
  assert.equal(mode, 0o600);

  const refreshResult = await runCli(['auth', 'refresh'], { env, fetchImpl });
  assert.equal(refreshResult.exitCode, 0);
  assert.doesNotMatch(refreshResult.stdout, /token-two/);
  const refreshPayload = JSON.parse(refreshResult.stdout);
  assert.equal(refreshPayload.data.tokenSaved, true);
  config = readConfig(env);
  assert.equal(config.profiles.default.token, 'token-two');

  const logoutResult = await runCli(['auth', 'logout'], { env, fetchImpl });
  assert.equal(logoutResult.exitCode, 0);
  config = readConfig(env);
  assert.equal(config.profiles.default.token, '');
});

test('auth login with a token saves without echoing the token', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filter-cli-auth-token-'));
  const token = 'filter_test_token_12345678901234567890';
  const env = createEnv(tempDir);
  const fetchImpl = createFetchQueue([
    {
      url: 'http://localhost:3000/api/auth/me',
      method: 'GET',
      assert(_url, options) {
        assert.equal(options.headers.Authorization, `Bearer ${token}`);
      },
      payload: {
        ok: true,
        user: { id: 1, email: 'person@example.com' },
      },
    },
  ]);

  const result = await runCli(['auth', 'login', '--token', token], { env, fetchImpl });

  assert.equal(result.exitCode, 0);
  assert.doesNotMatch(result.stdout, new RegExp(token));
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.data.tokenSaved, true);
  assert.equal(payload.data.user.email, 'person@example.com');
  assert.equal(readConfig(env).profiles.default.token, token);
});

test('interactive auth prompt writes through injected stderr', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filter-cli-auth-prompt-'));
  const env = createEnv(tempDir);
  const stdin = { isTTY: false };

  const result = await runCli(['auth', 'login'], {
    env,
    stdin,
    fetchImpl: async () => {
      throw new Error('prompt failure should happen before fetch');
    },
  });

  assert.equal(result.exitCode, 6);
  assert.match(result.stderr, /Open http:\/\/localhost:3000\/settings\/api-keys/);
  assert.match(result.stderr, /Cannot prompt for input/);
});

test('feed list passes query params and returns pagination metadata', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filter-cli-feed-list-'));
  const env = createEnv(tempDir, { FILTER_API_TOKEN: 'token-list' });
  const fetchImpl = createFetchQueue([
    {
      url: 'http://localhost:3000/api/feed?page=2&perPage=10&source=rss&read=unread&state=active&sort=posted_desc&q=ai',
      method: 'GET',
      assert(_url, options) {
        assert.equal(options.headers.Authorization, 'Bearer token-list');
      },
      payload: {
        ok: true,
        data: [{ id: 42, title: 'AI item' }],
        filters: { source: 'rss' },
        pagination: { page: 2, perPage: 10, total: 1, totalPages: 1 },
      },
    },
  ]);

  const result = await runCli(
    ['feed', 'list', '--page', '2', '--per-page', '10', '--source', 'rss', '--read', 'unread', '--state', 'active', '--sort', 'posted_desc', '--q', 'ai'],
    { env, fetchImpl }
  );

  assert.equal(result.exitCode, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.meta.pagination.total, 1);
  assert.equal(payload.data.items[0].id, 42);
});

test('invalid numeric options fail validation before fetching', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filter-cli-validation-'));
  const env = createEnv(tempDir, { FILTER_API_TOKEN: 'token-validation' });
  const fetchImpl = async () => {
    throw new Error('validation failures should not call fetch');
  };

  const badMaxUses = await runCli(['ai', 'web-search', '--query', 'latest ai news', '--max-uses', 'nope'], {
    env,
    fetchImpl,
  });
  assert.equal(badMaxUses.exitCode, 2);
  assert.match(badMaxUses.stderr, /max-uses must be a positive integer/);

  const tooManyUses = await runCli(['ai', 'web-search', '--query', 'latest ai news', '--max-uses', '9'], {
    env,
    fetchImpl,
  });
  assert.equal(tooManyUses.exitCode, 2);
  assert.match(tooManyUses.stderr, /max-uses must be an integer between 1 and 8/);

  const badPage = await runCli(['feed', 'list', '--page', 'abc'], {
    env,
    fetchImpl,
  });
  assert.equal(badPage.exitCode, 2);
  assert.match(badPage.stderr, /page must be a positive integer/);
});

test('feed reader truncates by default and returns full content with --full', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filter-cli-reader-'));
  const env = createEnv(tempDir, { FILTER_API_TOKEN: 'token-reader' });
  const longText = 'A'.repeat(2000);
  const longHtml = '<p>' + 'B'.repeat(3000) + '</p>';
  const fetchImpl = createFetchQueue([
    {
      url: 'http://localhost:3000/api/feed/7/reader',
      method: 'GET',
      payload: {
        ok: true,
        data: {
          article: {
            text_content: longText,
            content_html: longHtml,
          },
        },
      },
    },
    {
      url: 'http://localhost:3000/api/feed/7/reader',
      method: 'GET',
      payload: {
        ok: true,
        data: {
          article: {
            text_content: longText,
            content_html: longHtml,
          },
        },
      },
    },
  ]);

  const preview = await runCli(['feed', 'reader', '--id', '7'], { env, fetchImpl });
  assert.equal(preview.exitCode, 0);
  const previewPayload = JSON.parse(preview.stdout);
  assert.equal(previewPayload.meta.truncated, true);
  assert.ok(previewPayload.data.article.text_content.length < longText.length);

  const full = await runCli(['feed', 'reader', '--id', '7', '--full'], { env, fetchImpl });
  assert.equal(full.exitCode, 0);
  const fullPayload = JSON.parse(full.stdout);
  assert.equal(fullPayload.meta.truncated, false);
  assert.equal(fullPayload.data.article.text_content.length, longText.length);
});

test('confirm-gated commands require --confirm before mutating', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filter-cli-confirm-'));
  const env = createEnv(tempDir, { FILTER_API_TOKEN: 'token-confirm' });

  const result = await runCli(['sources', 'delete', '--id', '9'], {
    env,
    fetchImpl: async () => {
      throw new Error('confirm-gated command should not call fetch without --confirm');
    },
  });

  assert.equal(result.exitCode, 5);
  const payload = JSON.parse(result.stderr);
  assert.equal(payload.status, 'pending_confirmation');
});

test('sources create, feed tags, library add, views create, and reports add-items send the expected write payloads', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filter-cli-writes-'));
  const env = createEnv(tempDir, { FILTER_API_TOKEN: 'token-writes' });
  const fetchImpl = createFetchQueue([
    {
      url: 'http://localhost:3000/api/sources',
      method: 'POST',
      assert(_url, options) {
        const body = JSON.parse(String(options.body));
        assert.equal(body.source, 'x');
        assert.equal(body.usernames, 'openai,verge');
        assert.equal(body.enabled, false);
      },
      payload: { ok: true, status: 'added', id: 11 },
    },
    {
      url: 'http://localhost:3000/api/feed/42/tags',
      method: 'PATCH',
      assert(_url, options) {
        const body = JSON.parse(String(options.body));
        assert.deepEqual(body.tags, ['AI', 'Research']);
        assert.equal(body.mode, 'add');
      },
      payload: { ok: true, data: { itemId: 42, topics: [{ id: 1, name: 'AI' }] } },
    },
    {
      url: 'http://localhost:3000/api/feed/42/library',
      method: 'POST',
      payload: { ok: true },
    },
    {
      url: 'http://localhost:3000/api/views',
      method: 'POST',
      assert(_url, options) {
        const body = JSON.parse(String(options.body));
        assert.equal(body.name, 'AI Inbox');
        assert.deepEqual(body.topicNames, ['AI']);
        assert.deepEqual(body.connectorIds, [11]);
      },
      payload: { ok: true, data: { id: 12, name: 'AI Inbox' } },
    },
    {
      url: 'http://localhost:3000/api/reports/8/items',
      method: 'POST',
      assert(_url, options) {
        const body = JSON.parse(String(options.body));
        assert.deepEqual(body.feedItemIds, [42, 43]);
      },
      payload: { ok: true },
    },
  ]);

  assert.equal(
    (await runCli(['sources', 'create', '--source', 'x', '--usernames', 'openai,verge', '--disabled', '--confirm'], { env, fetchImpl })).exitCode,
    0
  );
  assert.equal(
    (await runCli(['feed', 'tags', '--id', '42', '--tag', 'AI', '--tag', 'Research', '--confirm'], { env, fetchImpl })).exitCode,
    0
  );
  assert.equal(
    (await runCli(['library', 'add', '--id', '42', '--confirm'], { env, fetchImpl })).exitCode,
    0
  );
  assert.equal(
    (await runCli(['views', 'create', '--name', 'AI Inbox', '--topic-name', 'AI', '--source-id', '11', '--confirm'], { env, fetchImpl })).exitCode,
    0
  );
  assert.equal(
    (await runCli(['reports', 'add-items', '--id', '8', '--feed-item-id', '42', '--feed-item-id', '43', '--confirm'], { env, fetchImpl })).exitCode,
    0
  );
});

test('reports generate and AI commands hit the expected endpoints', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filter-cli-ai-'));
  const env = createEnv(tempDir, { FILTER_API_TOKEN: 'token-ai' });
  const longContent = '# Report\n\n' + 'Summary '.repeat(400);
  const fetchImpl = createFetchQueue([
    {
      url: 'http://localhost:3000/api/reports/8/generate',
      method: 'POST',
      payload: {
        ok: true,
        data: {
          content: longContent,
          citations: [{ url: 'https://example.com' }],
        },
      },
    },
    {
      url: 'http://localhost:3000/api/ai/discover-sources',
      method: 'POST',
      payload: {
        ok: true,
        data: {
          total: 1,
          candidates: [{ source: 'rss', configKey: 'https://example.com/feed.xml' }],
        },
      },
    },
    {
      url: 'http://localhost:3000/api/ai/parse-filter',
      method: 'POST',
      payload: {
        ok: true,
        data: {
          parser: 'llm',
          intent: { source: 'podcast', read: 'unread' },
        },
      },
    },
    {
      url: 'http://localhost:3000/api/ai/web-search',
      method: 'POST',
      payload: {
        ok: true,
        data: {
          answer: 'Latest update',
          sources: [{ url: 'https://openai.com' }],
        },
      },
    },
  ]);

  const generate = await runCli(['reports', 'generate', '--id', '8', '--confirm'], { env, fetchImpl });
  assert.equal(generate.exitCode, 0);
  const generatedPayload = JSON.parse(generate.stdout);
  assert.equal(generatedPayload.meta.truncated, true);

  assert.equal(
    (await runCli(['ai', 'discover-sources', '--text', 'https://example.com/feed.xml'], { env, fetchImpl })).exitCode,
    0
  );
  assert.equal(
    (await runCli(['ai', 'parse-filter', '--text', 'Unread podcasts'], { env, fetchImpl })).exitCode,
    0
  );
  assert.equal(
    (await runCli(['ai', 'web-search', '--query', 'latest ai news'], { env, fetchImpl })).exitCode,
    0
  );
});
