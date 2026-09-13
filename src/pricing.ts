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
