# filter-cli

Command-line client for the [Filter](https://getfilter.ai) API. Lets agents and scripts query and mutate a user's Filter account over HTTP.

```bash
npm install -g filter-cli

filter auth login --email you@example.com --password ...
filter feed list --pretty
filter feed save --id 1234 --confirm
```

## What it is

`filter` is a structured, API-backed CLI for Filter — built for agents first, humans second.

- Talks to the authenticated HTTP API. No local DB access.
- Emits JSON by default so agents can parse it reliably.
- `--confirm` gates every state-changing command. No silent mutations.
- Registry-driven: `filter catalog` returns the shipped command list as JSON, validated against a bundled OpenAPI spec.

## Install

```bash
npm install -g filter-cli
```

Or run without installing:

```bash
npx filter-cli catalog
```

## Auth

```bash
# Email + password — issues and saves a bearer token
filter auth login --email you@example.com --password ...

# Or paste an existing token (e.g. from web settings)
filter auth use-token --token YOUR_TOKEN

# Verify
filter auth whoami
```

Profiles are saved at `$XDG_CONFIG_HOME/filter/config.json` (or `~/.config/filter/config.json`).

Resolution order: CLI flags > `FILTER_API_TOKEN` / `FILTER_API_BASE_URL` env vars > saved profile.

## Quick reference

```bash
filter catalog                         # List all commands as JSON
filter feed list --read unread         # Unread feed items
filter feed reader --id 1234           # Read an article (preview)
filter feed reader --id 1234 --full    # Read an article (full)
filter feed save --id 1234 --confirm   # Save to library
filter highlights list --id 1234       # Highlights for a feed item
filter sources list                    # Connected sources
filter sources create --type rss --url https://...
filter library list                    # Saved articles
filter views list                      # Custom views
filter reports list                    # Generated reports
filter ai chat --message "..."         # Chat with the assistant
```

Run `filter <command> --help` for full options on any command.

## Global flags

| Flag | Purpose |
|------|---------|
| `--json` | Emit JSON (default) |
| `--pretty` | Emit human-readable output |
| `--base-url` | Override the API base URL |
| `--token` | Override the bearer token for one call |
| `--profile` | Select a saved profile |
| `--timeout` | HTTP timeout in milliseconds |
| `--confirm` | Allow confirm-gated write commands to execute |
| `--full` | Request full content (not preview) where applicable |
| `--help` | Command-specific help |

## JSON contract

Every command returns the same shape:

```json
{
  "ok": true,
  "status": "ok",
  "data": {},
  "error": null,
  "meta": {
    "command": "feed list",
    "safety": "auto"
  }
}
```

`meta.pagination` appears on paginated lists. `meta.truncated` appears on preview commands.

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `2` | Validation failure |
| `3` | Auth failure or missing token |
| `4` | Not found |
| `5` | Confirmation required |
| `6` | Transport, timeout, or server failure |

## Confirmation gating

Write commands marked `confirm` never prompt interactively:

```bash
filter sources delete --id 5
# → status: "pending_confirmation", exit code 5

filter sources delete --id 5 --confirm
# → executes
```

This makes the CLI safe to compose into scripts and agent workflows.

## Using with agents

Agents (Claude Code, Cursor, custom scripts) can call the CLI directly — no MCP server needed.

`filter catalog` returns every shipped command as JSON, including `description`, `args`, `safety`, and `usage`. Agents should call `catalog` first to discover commands, then shell out to specific calls and parse the standard `{ ok, status, data, error, meta }` envelope.

## Configuration

| Env var | Purpose |
|---------|---------|
| `FILTER_API_TOKEN` | Bearer token for one-off calls without a saved profile |
| `FILTER_API_BASE_URL` | Override the API base URL (default: `https://getfilter.ai`) |
| `FILTER_OPENAPI_PATH` | Override the bundled OpenAPI spec (advanced) |

## Development

```bash
git clone https://github.com/cbelling/filter-cli
cd filter-cli
node src/index.js catalog
npm test
```

The CLI ships a frozen `openapi.json` that defines its surface. To update it against the live API, copy from the [filter](https://github.com/cbelling/filter) repo's generator output.

## License

MIT
