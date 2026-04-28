const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { COMMANDS } = require('../src/registry');

function loadSpec() {
  const specPath = path.resolve(__dirname, '..', 'openapi.json');
  return JSON.parse(fs.readFileSync(specPath, 'utf8'));
}

test('every API-backed CLI command maps to an operation in the bundled OpenAPI spec', () => {
  const spec = loadSpec();
  const operationIds = new Set();

  for (const methods of Object.values(spec.paths || {})) {
    for (const operation of Object.values(methods || {})) {
      if (operation?.operationId) operationIds.add(operation.operationId);
    }
  }

  for (const command of COMMANDS) {
    if (command.operationId) {
      assert.ok(
        operationIds.has(command.operationId),
        `${command.path.join(' ')} is missing OpenAPI operation ${command.operationId}`
      );
    }

    for (const operationId of command.operationIds || []) {
      assert.ok(
        operationIds.has(operationId),
        `${command.path.join(' ')} is missing OpenAPI operation ${operationId}`
      );
    }
  }
});
