# OpenLux Pricing Plugin Implementation

This document defines a pricing-only plugin redesign.

## Problem

OpenCode calculates session cost locally from token usage and model metadata.
OpenLux pricing changes dynamically, so hard-coded model prices or a manually
selected global routing group are not acceptable.

Model availability and model metadata discovery are separate concerns. The
plugin must not implement them. `opencode-models-discovery@1.5.3` handles
model-list availability.

## Authoritative Source

```text
GET https://api.openlux.ai/api/pricing
```

No authentication is required.

Relevant response fields:

- `data[]`
- `model_name`
- `quota_type`
- `model_ratio`
- `completion_ratio`
- `cache_ratio`
- `cache_creation_5m_ratio`
- `cache_creation_1h_ratio`
- `enable_groups[]`
- top-level `group_ratio`
- `step_ratios[]` for context-dependent pricing
- `model_price` for fixed-price models

## Explicit Non-Goals

The plugin must not:

- Fetch `/v1/models`.
- Discover or add models.
- Manage or read OpenCode credentials directly.
- Change model limits, capabilities, or provider configuration.
- Poll usage-log endpoints.
- Claim provider-authoritative billing reconciliation.

The plugin enriches cost metadata for models already present in the
configured `openlux` provider.

## Plugin Integration

The plugin should use the OpenCode config hook to inspect configured
`openlux.models` and add or replace their `cost` metadata.

Required behavior:

1. Leave model discovery to `opencode-models-discovery@1.5.3`.
2. Fetch public `/api/pricing`.
3. Match records by exact `model_name` and configured model ID.
4. Preserve all existing model metadata except calculated `cost` fields.
5. Skip unavailable, fixed-price, and malformed pricing records.
6. Keep OpenCode startup working when the pricing endpoint fails.

The implementation must verify installed `@opencode-ai/plugin` types before
choosing hooks.

## Price Conversion

For token-priced models (`quota_type == 0`):

```ts
const group = Math.min(
  ...model.enable_groups.map((name) => pricing.group_ratio[name]),
)

input = 2 * model.model_ratio * group
output = 2 * model.model_ratio * model.completion_ratio * group
cacheRead = 2 * model.model_ratio * model.cache_ratio * group
cacheWrite = 2 * model.model_ratio * cacheCreationRatio * group
```

Rules:

- Select group ratio per model, not globally.
- Require at least one enabled group with a valid ratio.
- Validate every used numeric field as finite and non-negative.
- Prefer `cache_creation_5m_ratio`.
- Use one-hour cache pricing only when target schema supports it.
- Omit unavailable cache prices rather than inventing values.
- Warn and skip malformed records.

## Context Tiers

Some models contain `step_ratios`, such as:

```text
[0, 272000]       input ratio 1x, output ratio 1x
(272000, 1000000] input ratio 2x, output ratio 1.5x
```

Preserve tiers only if the active OpenCode cost schema supports them. If it
supports only a fixed `context_over_200k` threshold, document and test the
approximation. Do not claim exact boundary pricing silently.

## Resilience

- Apply a request timeout.
- Cache last valid pricing response in process memory.
- Use cached pricing after refresh failure.
- Leave existing costs unchanged when no valid pricing exists.
- Never log response secrets or credentials.

## Project Structure

```text
src/
  plugin.ts          OpenCode entry point and config hook
  openlux-api.ts     HTTP client and response validation
  pricing.ts         group selection and price conversion
test/
  pricing.test.ts
  openlux-api.test.ts
  plugin.test.ts
```

Package requirements:

- TypeScript.
- `@opencode-ai/plugin` as a peer dependency.
- Build output suitable for OpenCode plugin loading.
- No committed credentials.
- No runtime dependency on the user's global OpenCode directory.

## Testing Requirements

Unit tests must cover:

- Cheapest enabled group selection per model.
- Missing or invalid group ratios.
- Normal input/output/cache prices.
- Fixed-price model skipping.
- Missing cache-write fields.
- Context step ratios or documented approximation.
- Malformed API responses.
- Network timeout and stale-cache fallback.
- Configured model matching.
- Preservation of existing model metadata.

Live pricing tests must be opt-in.

## Completion Criteria

1. Repository has package metadata, source, tests, README, license, and build.
2. Plugin loads from a local built path in OpenCode.
3. Pricing is fetched dynamically from `/api/pricing`.
4. No base-price or global pricing-group environment variables are required.
5. Cheapest valid enabled group is selected per model.
6. Representative dashboard prices match after rounding.
7. Fixed-price and unavailable models remain unchanged.
8. Network failure does not break OpenCode startup.
9. Model discovery remains owned by `opencode-models-discovery@1.5.3`.
10. Documentation distinguishes local estimates from provider billing.

## Known Risks

- OpenLux may change undocumented response fields or dashboard formulas.
- Automatic routing may use a non-cheapest fallback route for a request.
- OpenCode cost schemas may not represent context and cache tiers exactly.
- Dashboard prices may be estimates rather than final account charges.
