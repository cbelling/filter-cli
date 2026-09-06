const fs = require('fs');
const path = require('path');

const DEFAULT_TIMEOUT_MS = 15_000;

class CliError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'CliError';
    this.code = options.code || 'cli_error';
    this.exitCode = Number.isFinite(Number(options.exitCode)) ? Number(options.exitCode) : 6;
    this.httpStatus = Number.isFinite(Number(options.httpStatus)) ? Number(options.httpStatus) : null;
    this.details = options.details ?? null;
  }
}

let cachedSpecPath = null;
let cachedOperationMap = null;

function getSpecPath(env = process.env) {
  if (typeof env.FILTER_OPENAPI_PATH === 'string' && env.FILTER_OPENAPI_PATH.trim()) {
    return path.resolve(env.FILTER_OPENAPI_PATH.trim());
  }
  return path.resolve(__dirname, '..', 'openapi.json');
}

function normalizeApiPath(pathname) {
  return String(pathname || '').replace(/^\/api\/v1(?=\/|$)/, '/api');
}

function loadOperationMap(env = process.env) {
  const specPath = getSpecPath(env);
  if (cachedOperationMap && cachedSpecPath === specPath) return cachedOperationMap;

  let spec = null;
  try {
    spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new CliError(
        `OpenAPI spec not found at ${specPath}. This is a packaging bug — please file an issue.`,
        { code: 'missing_openapi', exitCode: 6 }
      );
    }
    throw error;
  }

  const operationMap = new Map();

  for (const [pathname, methods] of Object.entries(spec.paths || {})) {
    for (const [method, operation] of Object.entries(methods || {})) {
      if (!operation?.operationId) continue;
      operationMap.set(operation.operationId, {
        operationId: operation.operationId,
        method: String(method || 'get').toUpperCase(),
        path: pathname,
        parameters: Array.isArray(operation.parameters) ? operation.parameters : [],
      });
    }
  }

  cachedSpecPath = specPath;
  cachedOperationMap = operationMap;
  return operationMap;
}

function getOperation(operationId, env = process.env) {
  const operation = loadOperationMap(env).get(operationId);
  if (!operation) {
    throw new CliError(`Unknown API operation "${operationId}".`, {
      code: 'unknown_operation',
      exitCode: 6,
    });
  }
  return operation;
}

function appendQuery(url, query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry === undefined || entry === null || entry === '') continue;
        params.append(key, String(entry));
      }
      continue;
    }
    params.append(key, String(value));
  }

  const serialized = params.toString();
  if (serialized) url.search = serialized;
}

function buildOperationUrl(baseUrl, operation, request = {}) {
  let pathname = normalizeApiPath(operation.path);
  const pathParams = request.path || {};
  for (const parameter of operation.parameters.filter((entry) => entry.in === 'path')) {
    const value = pathParams[parameter.name];
    if (value === undefined || value === null || value === '') {
      throw new CliError(`Missing required path parameter "${parameter.name}".`, {
        code: 'missing_path_parameter',
        exitCode: 2,
      });
    }
    pathname = pathname.replace(`{${parameter.name}}`, encodeURIComponent(String(value)));
  }

  const url = new URL(pathname, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  appendQuery(url, request.query);
  return url;
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch (_error) {
      return null;
    }
  }

  const text = await response.text();
  if (!text) return null;
  return { message: text };
}

function mapHttpError(response, payload) {
  const message =
    String(payload?.message || payload?.error || payload?.reply || '').trim() ||
    `Request failed with HTTP ${response.status}.`;

  if (response.status === 400) {
    return new CliError(message, {
      code: String(payload?.error || 'validation'),
      exitCode: 2,
      httpStatus: response.status,
      details: payload?.details || payload,
    });
  }

  if (response.status === 401 || response.status === 403) {
    return new CliError(message, {
      code: String(payload?.error || 'unauthorized'),
      exitCode: 3,
      httpStatus: response.status,
      details: payload,
    });
  }

  if (response.status === 404) {
    return new CliError(message, {
      code: String(payload?.error || 'not_found'),
      exitCode: 4,
      httpStatus: response.status,
      details: payload,
    });
  }

  return new CliError(message, {
    code: String(payload?.error || 'request_failed'),
    exitCode: 6,
    httpStatus: response.status,
    details: payload,
  });
}

async function requestJson({ method, url, token, body, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
      Accept: 'application/json',
    };

    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const payload = await parseResponse(response);
    if (!response.ok) {
      throw mapHttpError(response, payload);
    }

    return {
      httpStatus: response.status,
      payload,
    };
  } catch (error) {
    if (error instanceof CliError) throw error;
    if (error?.name === 'AbortError') {
      throw new CliError(`Request timed out after ${timeoutMs}ms.`, {
        code: 'timeout',
        exitCode: 6,
      });
    }
    throw new CliError(String(error?.message || 'Request failed.'), {
      code: 'transport_error',
      exitCode: 6,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function callOperation({ operationId, request = {}, context = {}, authRequired = true }) {
  const operation = getOperation(operationId, context.env);
  if (authRequired && !context.token) {
    throw new CliError('API token is required. Use `filter auth login` or `filter auth use-token` first.', {
      code: 'missing_token',
      exitCode: 3,
    });
  }

  const url = buildOperationUrl(context.baseUrl, operation, request);
  return requestJson({
    method: operation.method,
    url,
    token: authRequired ? context.token : '',
    body: request.body,
    timeoutMs: context.timeoutMs,
  });
}

module.exports = {
  CliError,
  DEFAULT_TIMEOUT_MS,
  callOperation,
};
