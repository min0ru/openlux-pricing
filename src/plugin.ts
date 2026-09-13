import type { Plugin } from "@opencode-ai/plugin"
import { DEFAULT_PRICING_URL, fetchPricing } from "./openlux-api.js"
import { modelCost, type CacheWriteTier, type PricingModel } from "./pricing.js"

type Options = {
  pricingUrl?: string
  timeoutMs?: number
  cacheWriteTier?: CacheWriteTier
}

type ConfigModel = {
  cost?: Record<string, unknown>
  [key: string]: unknown
}

type Config = {
  provider?: {
    openlux?: {
      models?: Record<string, ConfigModel>
    }
  }
}

export async function applyPricing(config: Config, options: Options = {}): Promise<number> {
  const models = config.provider?.openlux?.models
  if (!models) return 0

  const pricing = await fetchPricing(
    options.pricingUrl ?? DEFAULT_PRICING_URL,
    options.timeoutMs ?? 3_000,
  )
  if (!pricing) return 0

  const pricingByModel = new Map(
    pricing.data
      .filter((model) => model.available !== false && typeof model.model_name === "string")
      .map((model) => [model.model_name as string, model]),
  )

  let updated = 0
  for (const [modelId, modelConfig] of Object.entries(models)) {
    const model = pricingByModel.get(modelId)
    if (!model) continue

    const cost = modelCost(model, pricing.group_ratio, options.cacheWriteTier)
    if (!cost) continue

    modelConfig.cost = cost
    updated++
  }

  console.info(`OpenLux pricing updated ${updated} configured model(s)`)
  return updated
}

export default (async (_input, rawOptions) => {
  const options = (rawOptions ?? {}) as Options
  return {
    config: async (config: Config) => {
      await applyPricing(config, options)
    },
  }
}) satisfies Plugin

export type { PricingModel }
