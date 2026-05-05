# Filter CLI

## Use the command line to manage your Filter workspace.

The Filter CLI lets you read and update your Filter workspace from a terminal, script, or agent.

```bash
npm install -g filter-cli

filter auth login
filter feed list --pretty
filter feed save --id 1234 --confirm
```

## Install

```bash
npm install -g filter-cli
```

Or run it without installing:

```bash
npx filter-cli catalog
```

## Log in

Create an API token in the Filter app at:

```text
https://getfilter.ai/settings/api-keys
```

Then run:

```bash
filter auth login
filter auth whoami
```

`filter auth login` prints the token settings URL, prompts for your token, validates it, and saves it to your local config.

You can also pass a token directly:

```bash
filter auth login --token YOUR_TOKEN
```

Tokens are saved at `$XDG_CONFIG_HOME/filter/config.json` or `~/.config/filter/config.json`. Auth commands do not print bearer tokens back to stdout.

## Usage

Installing the CLI provides access to the `filter` command.

```bash
filter [command]

# Run --help for detailed information about CLI commands
filter [command] --help
```

## Commands

The Filter CLI supports commands for feed items, sources, views, reports, highlights, auth, and AI helpers. Below are some of the most used ones:

- [auth login](https://getfilter.ai/docs#auth-login)
- [auth whoami](https://getfilter.ai/docs#auth-whoami)
- [feed list](https://getfilter.ai/docs#feed-list)
- [feed reader](https://getfilter.ai/docs#feed-reader)
- [feed save](https://getfilter.ai/docs#feed-save)
- [feed tags](https://getfilter.ai/docs#feed-tags)
- [highlights list](https://getfilter.ai/docs#highlights-list)
- [sources list](https://getfilter.ai/docs#sources-list)
- [sources create](https://getfilter.ai/docs#sources-create)
- [views list](https://getfilter.ai/docs#views-list)
- [reports list](https://getfilter.ai/docs#reports-list)
- [ai web-search](https://getfilter.ai/docs#ai-web-search)
- [catalog](https://getfilter.ai/docs#catalog)

## Output

The CLI returns JSON by default:

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

Use `--pretty` for human-readable output.

```bash
filter feed list --pretty
```

## Documentation

For a full reference, see the CLI reference site:

```text
https://getfilter.ai/docs/cli
```

## License

Copyright (c) Austin Bellinger.

Licensed under the MIT license.
