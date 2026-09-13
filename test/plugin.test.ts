import { beforeEach, describe, expect, it, vi } from "vitest"
import { clearPricingCache } from "../src/openlux-api.js"
import { applyPricing } from "../src/plugin.js"

describe("plugin config hook", () => {
  beforeEach(() => {
    clearPricingCache()
    vi.restoreAllMocks()
  })

  it("updates configured matching models without replacing metadata", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      group_ratio: { route: 0.25 },
      data: [{
        model_name: "gpt-test",
        model_ratio: 1,
        completion_ratio: 2,
        enable_groups: ["route"],
      }],
    }), { status: 200, headers: { "content-type": "application/json" } })))

    const model = { limit: { context: 1000 }, name: "keep me" }
    const config = { provider: { openlux: { models: { "gpt-test": model } } } }
    await expect(applyPricing(config, { pricingUrl: "https://example.test/pricing" })).resolves.toBe(1)
    expect(model).toMatchObject({ limit: { context: 1000 }, name: "keep me", cost: { input: 0.5, output: 1 } })
  })

  it("skips unavailable pricing records", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      group_ratio: { route: 0.25 },
      data: [{
        model_name: "gpt-unavailable",
        available: false,
        model_ratio: 1,
        completion_ratio: 1,
        enable_groups: ["route"],
      }],
    }), { status: 200 })))

    const model = { limit: { context: 1000 } }
    const config = { provider: { openlux: { models: { "gpt-unavailable": model } } } }
    await expect(applyPricing(config, { pricingUrl: "https://example.test/pricing" })).resolves.toBe(0)
    expect(model).toEqual({ limit: { context: 1000 } })
  })
})
