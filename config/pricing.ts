/**
 * Prices used for real-cost tracking and for "Add a brain" quotes.
 * Every value can be overridden from the environment. Quotes use the
 * conservative (peak) LLM rates; actual spend is recorded per call.
 *
 * twitterapi.io: $0.15 per 1,000 returned tweets (15 credits each, 1 credit = $0.00001),
 * minimum 15 credits per request.
 * DeepSeek: per 1M tokens, peak rates (off-peak is half).
 */
const num = (name: string, fallback: number) => {
  const v = process.env[name];
  return v != null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : fallback;
};

export const PARSE_PRICE_PER_1K_POSTS = num("PARSE_PRICE_PER_1K_POSTS", 0.15);
export const PARSE_MIN_USD_PER_REQUEST = num("PARSE_MIN_USD_PER_REQUEST", 0.00015);

type LlmPrice = { inputMiss: number; inputHit: number; output: number };

/** USD per 1M tokens. */
export const LLM_PRICES: Record<string, LlmPrice> = {
  "deepseek-v4-pro": { inputMiss: 1.32, inputHit: 0.044, output: 3.96 },
  "deepseek-flash": { inputMiss: 0.3, inputHit: 0.006, output: 1.2 },
};

export function llmPrice(model: string): LlmPrice {
  return (
    LLM_PRICES[model] ?? {
      inputMiss: num("LLM_PRICE_PER_1M_INPUT_TOKENS", 1.32),
      inputHit: num("LLM_PRICE_PER_1M_CACHED_INPUT_TOKENS", 0.044),
      output: num("LLM_PRICE_PER_1M_OUTPUT_TOKENS", 3.96),
    }
  );
}

export const LLM_PRICE_PER_1M_INPUT_TOKENS = num("LLM_PRICE_PER_1M_INPUT_TOKENS", llmPrice(process.env.LLM_MODEL_DISTILL ?? "deepseek-v4-pro").inputMiss);
export const LLM_PRICE_PER_1M_OUTPUT_TOKENS = num("LLM_PRICE_PER_1M_OUTPUT_TOKENS", llmPrice(process.env.LLM_MODEL_DISTILL ?? "deepseek-v4-pro").output);

/** "Add a brain" price = real API cost × MARKUP. */
export const MARKUP = 2;

/** Cost of one twitterapi.io request that returned n tweets (minimum charge applies to empty pages). */
export function requestCostUsd(tweetsReturned: number): number {
  return Math.max((tweetsReturned / 1000) * PARSE_PRICE_PER_1K_POSTS, PARSE_MIN_USD_PER_REQUEST);
}

/** Estimated cost of fetching n tweets at ~20 per page. */
export function parseCostUsd(tweets: number): number {
  return (tweets / 1000) * PARSE_PRICE_PER_1K_POSTS;
}

export function llmCostUsd(model: string, usage: { input: number; cachedInput?: number; output: number }): number {
  const p = llmPrice(model);
  const cached = usage.cachedInput ?? 0;
  return ((usage.input - cached) * p.inputMiss + cached * p.inputHit + usage.output * p.output) / 1_000_000;
}
