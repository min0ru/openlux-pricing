import type { Plugin } from "@opencode-ai/plugin"
import { Plugin as V2Plugin } from "@opencode/plugin"
import { DEFAULT_PRICING_URL, fetchPricing } from "./openlux-api.js"
import { modelCost, modelCostsV2, type CacheWriteTier, type PricingModel } from "./pricing.js"

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

  const result = await fetchPricing(
    options.pricingUrl ?? DEFAULT_PRICING_URL,
    options.timeoutMs ?? 3_000,
  )
  if (!result) return 0
  const { pricing } = result

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

  if (result.source === "network") {
    console.info(`OpenLux pricing fetched; updated ${updated} configured model(s)`)
  }
  return updated
}

const v1 = (async (_input, rawOptions) => {
  const options = (rawOptions ?? {}) as Options
  return {
    config: async (config: Config) => {
      await applyPricing(config, options)
    },
  }
}) satisfies Plugin

type V2ModelEditor = {
  list(providerID?: string): ReadonlyArray<{ id: { toString(): string } }>
  update(providerID: string, modelID: string, update: (model: { cost: unknown }) => void): void
}

export function applyPricingV2(modelEditor: V2ModelEditor, pricing: PricingModel[], groupRatio: Record<string, unknown>, options: Options = {}): number {
  const pricingByModel = new Map(pricing
    .filter((model) => model.available !== false && typeof model.model_name === "string")
    .map((model) => [model.model_name as string, model]))
  let updated = 0
  for (const model of modelEditor.list("openlux")) {
    const source = pricingByModel.get(model.id.toString())
    if (!source) continue
    const cost = modelCostsV2(source, groupRatio, options.cacheWriteTier)
    if (!cost) continue
    modelEditor.update("openlux", model.id.toString(), (draft) => { draft.cost = cost })
    updated++
  }
  return updated
}

export const v2: V2Plugin.Plugin = V2Plugin.define({
  id: "opencode-openlux-pricing",
  setup: async (context) => {
    const options = context.options as Options
    const result = await fetchPricing(options.pricingUrl ?? DEFAULT_PRICING_URL, options.timeoutMs ?? 3_000)
    if (!result) return
    await context.model.transform((editor) => {
      const updated = applyPricingV2(editor, result.pricing.data, result.pricing.group_ratio, options)
      if (result.source === "network") console.info(`OpenLux pricing fetched; updated ${updated} V2 model(s)`)
    })
  },
})

export default v2
export { v1 }

export type { PricingModel }
