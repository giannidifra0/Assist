import 'server-only';

interface ModelPricePer1M {
  input: number;
  output: number;
}

const MODEL_PRICING: Record<string, ModelPricePer1M> = {
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  'gemini-3.8-flash': { input: 0.75, output: 3.75 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
};

const DEFAULT_PRICING: ModelPricePer1M = { input: 0.3, output: 2.5 };

export function getModelPricing(model: string | null | undefined): ModelPricePer1M {
  const normalized = model?.trim().toLowerCase() ?? '';
  if (!normalized) return DEFAULT_PRICING;
  return MODEL_PRICING[normalized] ?? DEFAULT_PRICING;
}

export function calculateTokenCostUsd(
  model: string | null | undefined,
  promptTokens: number,
  responseTokens: number
): number {
  const pricing = getModelPricing(model);
  const cost =
    (Math.max(0, promptTokens) * pricing.input +
      Math.max(0, responseTokens) * pricing.output) /
    1_000_000;
  return Number(cost.toFixed(6));
}
