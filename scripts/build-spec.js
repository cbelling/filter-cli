#!/usr/bin/env node
/*
 * Build a trimmed openapi.json containing only the operations the CLI uses.
 *
 * Source spec comes from --source <path>, FILTER_SOURCE_OPENAPI, or stdin.
 * Trimmed spec is written to ./openapi.json (override with --out).
 *
 * Run from the filter-cli repo root after the source repo regenerates its spec:
 *   node scripts/build-spec.js --source /path/to/filter/openapi.json
 */

const fs = require('node:fs');
const path = require('node:path');

const { COMMANDS } = require('../src/registry');

function parseArgs(argv) {
  const args = { source: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--source') args.source = argv[++i];
    else if (flag === '--out') args.out = argv[++i];
    else if (flag === '--help' || flag === '-h') {
      console.log('Usage: build-spec.js [--source <path>] [--out <path>]');
      process.exit(0);
    }
  }
  return args;
}

function collectOperationIds() {
  const ids = new Set();
  for (const command of COMMANDS) {
    if (command.operationId) ids.add(command.operationId);
    for (const id of command.operationIds || []) ids.add(id);
  }
  return ids;
}

function readSource({ source }) {
  const fromArg = source;
  const fromEnv = process.env.FILTER_SOURCE_OPENAPI;
  const sourcePath = fromArg || fromEnv;

  if (sourcePath) {
    const resolved = path.resolve(sourcePath);
    return JSON.parse(fs.readFileSync(resolved, 'utf8'));
  }

  if (process.stdin.isTTY) {
    console.error('No source spec provided. Pass --source <path>, FILTER_SOURCE_OPENAPI=<path>, or pipe JSON to stdin.');
    process.exit(2);
  }

  const chunks = [];
  process.stdin.on('data', (chunk) => chunks.push(chunk));
  return new Promise((resolve, reject) => {
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(error);
      }
    });
    process.stdin.on('error', reject);
  });
}

function trimSpec(spec, allowedIds) {
  const trimmedPaths = {};
  const usedSchemas = new Set();
  const keptIds = new Set();

  for (const [pathname, methods] of Object.entries(spec.paths || {})) {
    const trimmedMethods = {};
    for (const [method, operation] of Object.entries(methods || {})) {
      if (operation && allowedIds.has(operation.operationId)) {
        trimmedMethods[method] = operation;
        keptIds.add(operation.operationId);
        collectSchemaRefs(operation, usedSchemas);
      }
    }
    if (Object.keys(trimmedMethods).length > 0) {
      trimmedPaths[pathname] = trimmedMethods;
    }
  }

  // Walk schema refs transitively so any nested $ref dependencies come along.
  const components = spec.components || {};
  const sourceSchemas = components.schemas || {};
  expandSchemaRefs(usedSchemas, sourceSchemas);

  const trimmedSchemas = {};
  for (const name of usedSchemas) {
    if (sourceSchemas[name]) trimmedSchemas[name] = sourceSchemas[name];
  }

  const trimmed = {
    openapi: spec.openapi,
    info: spec.info,
    servers: spec.servers,
    paths: trimmedPaths,
  };

  if (Object.keys(trimmedSchemas).length > 0) {
    trimmed.components = { ...components, schemas: trimmedSchemas };
  }

  return { trimmed, keptIds };
}

function collectSchemaRefs(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectSchemaRefs(item, out);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === '$ref' && typeof value === 'string') {
      const match = value.match(/^#\/components\/schemas\/(.+)$/);
      if (match) out.add(match[1]);
      continue;
    }
    collectSchemaRefs(value, out);
  }
}

function expandSchemaRefs(used, sourceSchemas) {
  let added = true;
  while (added) {
    added = false;
    for (const name of [...used]) {
      const schema = sourceSchemas[name];
      if (!schema) continue;
      const refs = new Set();
      collectSchemaRefs(schema, refs);
      for (const ref of refs) {
        if (!used.has(ref)) {
          used.add(ref);
          added = true;
        }
      }
    }
  }
}

(async function main() {
  const args = parseArgs(process.argv.slice(2));
  const allowedIds = collectOperationIds();
  const sourceSpec = await readSource(args);

  const { trimmed, keptIds } = trimSpec(sourceSpec, allowedIds);

  const missing = [...allowedIds].filter((id) => !keptIds.has(id)).sort();
  if (missing.length > 0) {
    console.error(`Source spec is missing ${missing.length} operations the CLI references:`);
    for (const id of missing) console.error(`  - ${id}`);
    process.exit(1);
  }

  const outPath = path.resolve(args.out || path.resolve(__dirname, '..', 'openapi.json'));
  fs.writeFileSync(outPath, `${JSON.stringify(trimmed, null, 2)}\n`);

  const totalOps = Object.values(trimmed.paths).reduce((sum, methods) => sum + Object.keys(methods).length, 0);
  console.error(`Wrote ${outPath}`);
  console.error(`Operations kept: ${totalOps}`);
  console.error(`Paths kept: ${Object.keys(trimmed.paths).length}`);
})().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
