# AGENTS.md

Guidance for agents working in this repository.

## Repository Shape

`filter-cli` is a dependency-light Node CLI for the Filter API.

- Runtime: Node.js 20+
- Module system: CommonJS
- Entry point: `src/index.js`
- Commands: `src/commands/*.js`
- API contract: bundled `openapi.json`
- Tests: `node --test` via `npm test`

Keep changes small and aligned with the existing registry-driven command pattern.

## Branching

Use trunk-based development.

- `main` is the only long-lived branch.
- Do not add a long-lived `dev` branch for this repo.
- Create short-lived feature/fix branches from `main`.
- Merge by PR after CI passes.
- Keep `main` releasable at all times.

Suggested branch names may include Linear issue IDs, for example:

```bash
git checkout -b charles/fil-60-redact-auth-tokens
```

## CI

CI is configured in `.github/workflows/ci.yml` and runs on pull requests and pushes to `main`.

Expected checks:

```bash
npm test
npm pack --dry-run
```

The CI matrix covers supported/current runtimes:

- Node 20
- Node 22
- Node 24

The workflow uses `npm ci`, so `package-lock.json` must stay committed.

## Releases

Releases should come from `main`, not from feature branches or a `dev` branch.

The release flow is:

```bash
git checkout main
git pull
npm test
git tag vX.Y.Z
git push origin vX.Y.Z
```

Use the appropriate semver bump:

- `npm version patch` for fixes
- `npm version minor` for backward-compatible CLI additions
- `npm version major` for breaking command/output changes

Tags should use npm's `vX.Y.Z` format. The publish workflow in `.github/workflows/release.yml` triggers from `v*` tags and verifies that the tag matches `package.json` before publishing.

Do not use `git push --tags` for releases. Push only the intended version tag so old local tags cannot accidentally trigger release workflows.

## npm Publishing

Prefer npm Trusted Publishing through GitHub Actions OIDC instead of long-lived npm publish tokens.

The publish job:

- Runs on GitHub-hosted Ubuntu runners
- Uses Node 24
- Grants `id-token: write`
- Runs tests before `npm publish`

Configure the npm package's trusted publisher to match:

- Owner: `cbelling`
- Repository: `filter-cli`
- Workflow file: `release.yml`

Publish stable releases to the default `latest` dist-tag. For prereleases, use semver prerelease versions and publish under `next`.

## Safety Notes

- Never echo bearer tokens or API secrets in CLI output.
- Keep mutating commands confirm-gated unless the command is explicitly safe.
- Preserve the standard JSON envelope shape for command output.
- Update tests when changing command arguments, output shape, or API request payloads.
