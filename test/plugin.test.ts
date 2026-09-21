import { beforeEach, describe, expect, it, vi } from "vitest"
import { clearPricingCache } from "../src/openlux-api.js"
import { applyPricing, applyPricingV2, v1, v2 } from "../src/plugin.js"

describe("plugin config hook", () => {
  beforeEach(() => {
    clearPricingCache()
    vi.restoreAllMocks()
  })

  it("exports both V1 and V2 entrypoints", () => {
    expect(typeof v1).toBe("function")
    expect(v2.id).toBe("opencode-openlux-pricing")
    expect(typeof v2.setup).toBe("function")
  })

  it("updates existing V2 OpenLux model costs and preserves metadata", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      group_ratio: { route: 0.25 },
      data: [{ model_name: "gpt-6-astra", model_ratio: 2, completion_ratio: 3, enable_groups: ["route"] }],
    }), { status: 200 })))
    const model = {
      id: "gpt-6-astra", providerID: "openlux", name: "Astra", cost: [],
      capabilities: { tools: true, input: ["text"], output: ["text"] },
    }
    let updatedCost: unknown
    const editor = {
      list: () => [model],
      update: (_provider: string, _id: string, update: (value: typeof model) => void) => update({ ...model, get cost() { return updatedCost }, set cost(value) { updatedCost = value } } as typeof model),
    }
    expect(applyPricingV2(editor, [{ model_name: "gpt-6-astra", model_ratio: 2, completion_ratio: 3, enable_groups: ["route"] }], { route: 0.25 })).toBe(1)
    expect(updatedCost).toEqual([{ input: 1, output: 3, cache: { read: 0, write: 0 } }])
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

  it("logs only when pricing is fetched from network", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      group_ratio: { route: 0.25 },
      data: [{ model_name: "gpt-test", model_ratio: 1, completion_ratio: 1, enable_groups: ["route"] }],
    }), { status: 200 })))

    const config = { provider: { openlux: { models: { "gpt-test": {} } } } }
    await applyPricing(config, { pricingUrl: "https://example.test/pricing" })
    await applyPricing(config, { pricingUrl: "https://example.test/pricing" })

    expect(info).toHaveBeenCalledTimes(1)
    expect(info).toHaveBeenCalledWith("OpenLux pricing fetched; updated 1 configured model(s)")
  })
})
