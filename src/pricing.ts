export type CacheWriteTier = "5m" | "1h"

export type PricingModel = {
  model_name?: unknown
  available?: unknown
  quota_type?: unknown
  model_ratio?: unknown
  completion_ratio?: unknown
  cache_ratio?: unknown
  cache_creation_5m_ratio?: unknown
  cache_creation_1h_ratio?: unknown
  enable_groups?: unknown
  step_ratios?: unknown
}

export type PricingResponse = {
  success: boolean
  data: PricingModel[]
  group_ratio: Record<string, unknown>
}

export type ModelCost = {
  input: number
  output: number
  cache_read?: number
  cache_write?: number
}

export type V2ModelCost = {
  tier?: { type: "context"; size: number }
  input: number
  output: number
  cache: { read: number; write: number }
}

export function finiteNonNegative(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) && number >= 0 ? number : undefined
}

export function cheapestGroupRatio(
  model: PricingModel,
  groupRatios: Record<string, unknown>,
): number | undefined {
  if (!Array.isArray(model.enable_groups)) return undefined

  const ratios = model.enable_groups
    .filter((name): name is string => typeof name === "string")
    .map((name) => finiteNonNegative(groupRatios[name]))
    .filter((ratio): ratio is number => ratio !== undefined)

  return ratios.length > 0 ? Math.min(...ratios) : undefined
}

export function modelCost(
  model: PricingModel,
  groupRatios: Record<string, unknown>,
  cacheWriteTier: CacheWriteTier = "5m",
): ModelCost | undefined {
  if (finiteNonNegative(model.quota_type) === 1) return undefined

  const modelRatio = finiteNonNegative(model.model_ratio)
  const completionRatio = finiteNonNegative(model.completion_ratio)
  const group = cheapestGroupRatio(model, groupRatios)
  if (modelRatio === undefined || completionRatio === undefined || group === undefined) {
    return undefined
  }

  const cost: ModelCost = {
    input: 2 * modelRatio * group,
    output: 2 * modelRatio * completionRatio * group,
  }

  const cacheRatio = finiteNonNegative(model.cache_ratio)
  if (cacheRatio !== undefined) cost.cache_read = 2 * modelRatio * cacheRatio * group

  const cacheField = cacheWriteTier === "1h"
    ? model.cache_creation_1h_ratio
    : model.cache_creation_5m_ratio
  const cacheWriteRatio = finiteNonNegative(cacheField)
  if (cacheWriteRatio !== undefined) cost.cache_write = 2 * modelRatio * cacheWriteRatio * group

  return cost
}

/** Convert the legacy OpenLux price formula to the OpenCode 2 cost schema. */
export function modelCostsV2(
  model: PricingModel,
  groupRatios: Record<string, unknown>,
  cacheWriteTier: CacheWriteTier = "5m",
): V2ModelCost[] | undefined {
  const base = modelCost(model, groupRatios, cacheWriteTier)
  if (!base) return undefined

  const cache = {
    read: base.cache_read ?? 0,
    write: base.cache_write ?? 0,
  }
  const costs: V2ModelCost[] = [{ input: base.input, output: base.output, cache }]

  if (!Array.isArray(model.step_ratios)) return costs
  for (const step of model.step_ratios) {
    if (!step || typeof step !== "object") continue
    const record = step as Record<string, unknown>
    const size = finiteNonNegative(record.context ?? record.max_tokens ?? record.max_context ?? record.threshold)
    const inputRatio = finiteNonNegative(record.input_ratio ?? record.model_ratio)
    const outputRatio = finiteNonNegative(record.output_ratio ?? record.completion_ratio)
    if (size === undefined || inputRatio === undefined || outputRatio === undefined) continue
    const input = base.input * inputRatio
    const output = base.output * outputRatio
    const tierCache = {
      read: cache.read * inputRatio,
      write: cache.write * inputRatio,
    }
    costs.push({ tier: { type: "context", size }, input, output, cache: tierCache })
  }
  return costs
}

export function parsePricingResponse(value: unknown): PricingResponse {
  if (!value || typeof value !== "object") throw new Error("unexpected response shape")
  const response = value as Partial<PricingResponse>
  if (response.success !== true || !Array.isArray(response.data)) {
    throw new Error("unexpected response shape")
  }
  if (!response.group_ratio || typeof response.group_ratio !== "object") {
    throw new Error("missing group ratios")
  }
  return {
    success: true,
    data: response.data,
    group_ratio: response.group_ratio as Record<string, unknown>,
  }
}
