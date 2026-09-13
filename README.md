# OpenLux Pricing Plugin for OpenCode

OpenCode plugin that adds current OpenLux token prices to configured
`openlux` model metadata. Model discovery is intentionally outside this
plugin and is handled by `opencode-models-discovery@1.5.3`.

## Install

Add the package to OpenCode's plugin list in `opencode.json` or
`opencode.jsonc`:

```jsonc
{
  "plugin": [
    "opencode-openlux-pricing",
    "opencode-models-discovery@1.5.3"
  ]
}
```

Restart OpenCode after changing its configuration. The plugin updates pricing
for models already configured under the `openlux` provider. It does not add
models by itself.

## Scope

The plugin only owns pricing:

- Fetch public pricing from `https://api.openlux.ai/api/pricing`.
- Match pricing records to already configured OpenCode models.
- Select cheapest enabled routing group for each model.
- Convert OpenLux ratios to OpenCode `cost` fields.
- Keep OpenCode startup working when pricing fetch fails.
- Use a three-second request limit so an unavailable pricing service does not
  hold startup for the full OpenCode hook timeout.
- Cache successful pricing responses for one hour in the user's XDG cache
  directory, outside OpenCode's configuration directory.

The plugin does not discover models, manage credentials, change provider
limits, or reconcile provider billing.

## Pricing Formula

OpenLux uses a multiplier of `2` and the lowest ratio among each model's
`enable_groups`:

```text
group = min(group_ratio[name] for name in enable_groups)

input       = 2 * model_ratio * group
output      = 2 * model_ratio * completion_ratio * group
cache_read  = 2 * model_ratio * cache_ratio * group
cache_write = 2 * model_ratio * cache_creation_5m_ratio * group
```

Values are USD per million tokens. Cache-write pricing may use the one-hour
ratio when explicitly supported by the target OpenCode cost schema.

Models with `quota_type == 1` are fixed-price models and are skipped by the
token pricing conversion.

Prices are estimates used by OpenCode's local session accounting. They are not
provider billing statements or a guarantee of the final amount charged by
OpenLux.

## Development

During development, load the local built plugin from `opencode.jsonc`:

```jsonc
{
  "plugin": [
    "/path/to/openlux-pricing/dist/plugin.js",
    "opencode-models-discovery@1.5.3"
  ]
}
```

OpenCode must be restarted after plugin or configuration changes.

## Release

Releases publish automatically through GitHub Actions after a non-prerelease
GitHub release is published. The release tag must match `package.json`, for
example `v0.1.0`. npm Trusted Publishing supplies short-lived credentials; no
npm token is stored in GitHub Actions.

Maintainers should create the matching npm Trusted Publisher configuration for
repository `min0ru/openlux-pricing` and workflow `.github/workflows/publish.yml`
before publishing the first release.

## Troubleshooting

- No prices: confirm model discovery and the `openlux` provider are enabled.
- Slow first startup: pricing refresh can use the network once per cache TTL;
  later starts use the local cache.
- Stale prices: remove the pricing cache and restart OpenCode to force a
  refresh. The cache is under `$XDG_CACHE_HOME/opencode-openlux-pricing/` or
  `~/.cache/opencode-openlux-pricing/`.
- Startup failure: pricing errors are non-fatal; report the OpenCode version,
  plugin version, and sanitized logs in an issue.

## Status

This repository contains the working pricing plugin. See
[`IMPLEMENTATION.md`](./IMPLEMENTATION.md) for architecture, validation,
testing, and known limitations.

## Contributing

Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) before opening a pull request.
Security reports belong in [`SECURITY.md`](./SECURITY.md), not public issues.
