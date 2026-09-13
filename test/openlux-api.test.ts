import { beforeEach, describe, expect, it, vi } from "vitest"
import { clearPricingCache, fetchPricing } from "../src/openlux-api.js"

describe("OpenLux pricing fetch", () => {
  beforeEach(() => {
    clearPricingCache()
    vi.restoreAllMocks()
  })

  it("uses the last valid response after refresh failure", async () => {
    const response = new Response(JSON.stringify({
      success: true,
      group_ratio: { route: 0.25 },
      data: [],
    }), { status: 200 })
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response)
      .mockRejectedValueOnce(new Error("network down"))

    const first = await fetchPricing("https://example.test/pricing", 100, fetcher)
    const second = await fetchPricing("https://example.test/pricing", 100, fetcher)

    expect(second).toBe(first)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it("returns undefined when no valid response exists", async () => {
    const result = await fetchPricing(
      "https://example.test/pricing",
      100,
      vi.fn().mockRejectedValue(new Error("timeout")),
    )

    expect(result).toBeUndefined()
  })
})
