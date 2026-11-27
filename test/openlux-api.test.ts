import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { clearPricingCache, DEFAULT_PRICING_URL, fetchPricing } from "../src/openlux-api.js"

describe("OpenLux pricing fetch", () => {
  let cacheRoot: string

  beforeEach(async () => {
    cacheRoot = await mkdtemp(join(tmpdir(), "openlux-pricing-test-"))
    vi.stubEnv("XDG_CACHE_HOME", cacheRoot)
    clearPricingCache()
    vi.restoreAllMocks()
  })

  afterEach(async () => {
    clearPricingCache()
    vi.unstubAllEnvs()
    await rm(cacheRoot, { recursive: true, force: true })
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

    expect(second?.pricing).toBe(first?.pricing)
    expect(second?.source).toBe("stale")
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

  it("deduplicates concurrent network refreshes", async () => {
    const fetcher = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return new Response(JSON.stringify({
        success: true,
        group_ratio: { route: 0.25 },
        data: [],
      }), { status: 200 })
    })

    const results = await Promise.all([
      fetchPricing("https://example.test/pricing", 100, fetcher),
      fetchPricing("https://example.test/pricing", 100, fetcher),
    ])

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(results[0]?.source).toBe("network")
    expect(results[1]?.source).toBe("network")
  })

  it("creates a missing cache directory and reuses fresh pricing", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      success: true, group_ratio: { route: 0.25 }, data: [],
    })))
    const first = await fetchPricing(DEFAULT_PRICING_URL, 100, fetcher)
    const second = await fetchPricing(DEFAULT_PRICING_URL, 100, fetcher)
    expect(first?.source).toBe("network")
    expect(second?.source).toBe("disk")
    expect(second?.pricing).toEqual(first?.pricing)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("reuses prewritten fresh disk pricing on repeated calls", async () => {
    const pricing = { success: true, group_ratio: { route: 0.25 }, data: [] }
    const directory = join(cacheRoot, "opencode-openlux-pricing")
    await mkdir(directory)
    await writeFile(join(directory, "pricing.json"), JSON.stringify({ fetchedAt: Date.now(), pricing }))
    const fetcher = vi.fn()
    for (let i = 0; i < 2; i++) {
      const result = await fetchPricing(DEFAULT_PRICING_URL, 100, fetcher)
      expect(result?.pricing).toEqual(pricing)
      expect(result?.source).toBe("disk")
    }
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("deduplicates default-URL cold refreshes", async () => {
    const fetcher = vi.fn(async () => {
      await Promise.resolve()
      return new Response(JSON.stringify({
        success: true, group_ratio: { route: 0.25 }, data: [],
      }))
    })
    const results = await Promise.all([
      fetchPricing(DEFAULT_PRICING_URL, 100, fetcher),
      fetchPricing(DEFAULT_PRICING_URL, 100, fetcher),
    ])
    expect(results[0]?.source).toBe("network")
    expect(results[1]?.pricing).toEqual(results[0]?.pricing)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("retains memory pricing when the cache directory becomes inaccessible", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      success: true, group_ratio: { route: 0.25 }, data: [],
    })))
    const first = await fetchPricing(DEFAULT_PRICING_URL, 100, fetcher)
    await rm(cacheRoot, { recursive: true })
    await writeFile(cacheRoot, "not a directory")
    const second = await fetchPricing(DEFAULT_PRICING_URL, 100, fetcher)
    expect(second?.pricing).toEqual(first?.pricing)
    expect(second?.source).toBe("memory")
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
