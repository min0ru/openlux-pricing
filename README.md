# OpenLux Pricing Plugin for OpenCode

OpenCode plugin that adds current OpenLux token prices to configured
`openlux` model metadata. Model discovery is intentionally outside this
plugin and is handled by `opencode-models-discovery@1.5.3`.

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

## Status

This repository contains the pricing plugin design contract. See
[`IMPLEMENTATION.md`](./IMPLEMENTATION.md) for architecture, validation,
testing, and completion criteria.
