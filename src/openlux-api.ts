import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { parsePricingResponse, type PricingResponse } from "./pricing.js"

export const DEFAULT_PRICING_URL = "https://api.openlux.ai/api/pricing"

let cachedPricing: PricingResponse | undefined
let diskCacheLoaded = false
let memoryFetch: Promise<PricingResult> | undefined

const DISK_CACHE_TTL_MS = 60 * 60 * 1000
const LOCK_RETRY_MS = 50
const LOCK_TIMEOUT_MS = 10_000

export type PricingSource = "memory" | "disk" | "network" | "stale"
export type PricingResult = { pricing: PricingResponse; source: PricingSource }

function diskCachePath(): string {
  return join(
    process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
    "opencode-openlux-pricing",
    "pricing.json",
  )
}

async function loadDiskCache(url: string): Promise<PricingResult | undefined> {
  if (diskCacheLoaded || url !== DEFAULT_PRICING_URL) return undefined
  diskCacheLoaded = true

  try {
    const value = JSON.parse(await readFile(diskCachePath(), "utf8")) as {
      fetchedAt?: unknown
      pricing?: unknown
    }
    const pricing = parsePricingResponse(value.pricing)
    cachedPricing = pricing

    if (typeof value.fetchedAt === "number" && Date.now() - value.fetchedAt < DISK_CACHE_TTL_MS) {
      return { pricing, source: "disk" }
    }
  } catch {
    // Missing or malformed cache falls through to the network request.
  }
  return undefined
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

async function withDiskLock<T>(operation: () => Promise<T>): Promise<T> {
  const lockPath = `${diskCachePath()}.lock`
  const startedAt = Date.now()

  while (true) {
    try {
      const handle = await open(lockPath, "wx")
      await handle.close()
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      if (Date.now() - startedAt >= LOCK_TIMEOUT_MS) break
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS))
    }
  }

  try {
    return await operation()
  } finally {
    await unlink(lockPath).catch(() => undefined)
  }
}

async function readFreshDiskCache(): Promise<PricingResult | undefined> {
  try {
    const value = JSON.parse(await readFile(diskCachePath(), "utf8")) as {
      fetchedAt?: unknown
      pricing?: unknown
    }
    const pricing = parsePricingResponse(value.pricing)
    if (typeof value.fetchedAt === "number" && Date.now() - value.fetchedAt < DISK_CACHE_TTL_MS) {
      cachedPricing = pricing
      return { pricing, source: "disk" }
    }
  } catch {
    // Refresh from network when cache cannot be read.
  }
  return undefined
}

export async function fetchPricing(
  url = DEFAULT_PRICING_URL,
  timeoutMs = 3_000,
  fetcher: typeof fetch = fetch,
): Promise<PricingResult | undefined> {
  if (cachedPricing && url === DEFAULT_PRICING_URL) {
    const disk = await readFreshDiskCache()
    if (disk) return disk
    return { pricing: cachedPricing, source: "memory" }
  }

  const loaded = await loadDiskCache(url)
  if (loaded) return loaded
  if (memoryFetch) return memoryFetch

  memoryFetch = withDiskLock(async () => {
    const disk = url === DEFAULT_PRICING_URL ? await readFreshDiskCache() : undefined
    if (disk) return disk

    try {
      const response = await fetcher(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: "application/json" },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const pricing = parsePricingResponse(await response.json())
      cachedPricing = pricing
      await saveDiskCache(url, pricing)
      return { pricing, source: "network" }
    } catch (error) {
      if (cachedPricing) {
        console.warn(`OpenLux pricing refresh failed; using cached prices: ${error}`)
        return { pricing: cachedPricing, source: "stale" }
      }
      console.warn(`OpenLux pricing unavailable; costs will remain unchanged: ${error}`)
      throw error
    }
  })

  try {
    return await memoryFetch
  } catch {
    return undefined
  } finally {
    memoryFetch = undefined
  }
}

export function clearPricingCache(): void {
  cachedPricing = undefined
  diskCacheLoaded = false
  memoryFetch = undefined
}
