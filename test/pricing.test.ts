import { describe, expect, it } from "vitest"
import { cheapestGroupRatio, modelCost, modelCostsV2, parsePricingResponse } from "../src/pricing.js"

describe("pricing conversion", () => {
  const groups = { slow: 3, fast: 0.5 }

  it("selects cheapest enabled group per model", () => {
    expect(cheapestGroupRatio({ enable_groups: ["slow", "fast"] }, groups)).toBe(0.5)
  })

  it("calculates token and cache prices with multiplier two", () => {
    expect(modelCost({
      model_ratio: 0.1,
      completion_ratio: 4,
      cache_ratio: 0.2,
      cache_creation_5m_ratio: 0.3,
      enable_groups: ["fast"],
    }, groups)).toEqual({
      input: 0.1,
      output: 0.4,
      cache_read: 0.020000000000000004,
      cache_write: 0.03,
    })
  })

  it("keeps model when optional cache ratios are missing", () => {
    expect(modelCost({
      model_ratio: 1,
      completion_ratio: 2,
      enable_groups: ["fast"],
    }, groups)).toEqual({ input: 1, output: 2 })
  })

  it("skips fixed-price and malformed models", () => {
    expect(modelCost({ quota_type: 1, model_ratio: 1, completion_ratio: 1, enable_groups: ["fast"] }, groups)).toBeUndefined()
    expect(modelCost({ model_ratio: 1, completion_ratio: 1, enable_groups: ["missing"] }, groups)).toBeUndefined()
    expect(modelCost({ model_ratio: null, completion_ratio: 1, enable_groups: ["fast"] }, groups)).toBeUndefined()
  })

  it("validates response shape", () => {
    expect(() => parsePricingResponse({ success: true, data: [] })).toThrow("missing group ratios")
  })

  it("maps OpenLux step ratios to context tiers", () => {
    expect(modelCostsV2({
      model_ratio: 1,
      completion_ratio: 2,
      cache_ratio: 0.5,
      cache_creation_5m_ratio: 0.25,
      enable_groups: ["fast"],
      step_ratios: [{ step_size: 272000, prompt_step_ratio: 2, completion_step_ratio: 3, cache_step_ratio: 4 }],
    }, groups)).toEqual([
      { input: 1, output: 2, cache: { read: 0.5, write: 0.25 } },
      { tier: { type: "context", size: 272000 }, input: 2, output: 6, cache: { read: 2, write: 1 } },
    ])
  })
})
