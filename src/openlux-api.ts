import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { parsePricingResponse, type PricingResponse } from "./pricing.js"

export const DEFAULT_PRICING_URL = "https://api.openlux.ai/api/pricing"

let cachedPricing: PricingResponse | undefined
let diskCacheLoaded = false

const DISK_CACHE_TTL_MS = 60 * 60 * 1000

function diskCachePath(): string {
  return join(
    process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
    "opencode-openlux-pricing",
    "pricing.json",
  )
}

async function loadDiskCache(url: string): Promise<void> {
  if (diskCacheLoaded || url !== DEFAULT_PRICING_URL) return
  diskCacheLoaded = true

  try {
    const value = JSON.parse(await readFile(diskCachePath(), "utf8")) as {
      fetchedAt?: unknown
      pricing?: unknown
    }
    const pricing = parsePricingResponse(value.pricing)
    cachedPricing = pricing

    if (typeof value.fetchedAt === "number" && Date.now() - value.fetchedAt < DISK_CACHE_TTL_MS) {
      return
    }
  } catch {
    // Missing or malformed cache falls through to the network request.
  }
}

async function saveDiskCache(url: string, pricing: PricingResponse): Promise<void> {
  if (url !== DEFAULT_PRICING_URL) return

  try {
    const path = diskCachePath()
    await mkdir(join(path, ".."), { recursive: true })
    await writeFile(path, JSON.stringify({ fetchedAt: Date.now(), pricing }), "utf8")
  } catch {
    // Disk cache is an optimization; pricing still works when it is unwritable.
  }
}

export async function fetchPricing(
  url = DEFAULT_PRICING_URL,
  timeoutMs = 3_000,
  fetcher: typeof fetch = fetch,
): Promise<PricingResponse | undefined> {
  await loadDiskCache(url)
  if (cachedPricing && url === DEFAULT_PRICING_URL) {
    try {
      const value = JSON.parse(await readFile(diskCachePath(), "utf8")) as { fetchedAt?: unknown }
      if (typeof value.fetchedAt === "number" && Date.now() - value.fetchedAt < DISK_CACHE_TTL_MS) {
        return cachedPricing
      }
    } catch {
      // Fetch fresh pricing when cache cannot be read.
    }
  }

  try {
    const response = await fetcher(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/json" },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const pricing = parsePricingResponse(await response.json())
    cachedPricing = pricing
    await saveDiskCache(url, pricing)
    return pricing
  } catch (error) {
    if (cachedPricing) {
      console.warn(`OpenLux pricing refresh failed; using cached prices: ${error}`)
      return cachedPricing
    }
    console.warn(`OpenLux pricing unavailable; costs will remain unchanged: ${error}`)
    return undefined
  }
}

export function clearPricingCache(): void {
  cachedPricing = undefined
  diskCacheLoaded = false
}
