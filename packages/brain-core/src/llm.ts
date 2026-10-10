import { llmCostUsd } from "../../../config/pricing";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type LlmUsage = { input: number; cachedInput: number; output: number; costUsd: number };

export type CompleteOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
};

export interface LLM {
  readonly provider: string;
  complete(messages: ChatMessage[], opts?: CompleteOptions): Promise<{ text: string; usage: LlmUsage; model: string }>;
  stream(messages: ChatMessage[], opts?: CompleteOptions): AsyncGenerator<{ delta: string } | { usage: LlmUsage; model: string }>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * OpenAI-compatible chat client (DeepSeek by default). Any provider with a
 * /chat/completions endpoint works: set LLM_BASE_URL + LLM_API_KEY.
 * Model names come from env (LLM_MODEL_DISTILL / LLM_MODEL_CHAT), never code.
 */
export class OpenAICompatibleLLM implements LLM {
  readonly provider: string;
  private base: string;
  private key: string;
  private defaultModel: string;
  private jsonModeSupported = true;

  constructor(opts: { baseUrl?: string; apiKey?: string; model?: string; provider?: string } = {}) {
    this.base = (opts.baseUrl ?? process.env.LLM_BASE_URL ?? process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com").replace(/\/$/, "");
    this.key = opts.apiKey ?? process.env.LLM_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? "";
    this.defaultModel = opts.model ?? process.env.LLM_MODEL_DISTILL ?? "deepseek-v4-pro";
    this.provider = opts.provider ?? (this.base.includes("deepseek") ? "deepseek" : "openai-compatible");
    if (!this.key) throw new Error("LLM API key is not set (DEEPSEEK_API_KEY or LLM_API_KEY).");
  }

  private body(messages: ChatMessage[], opts: CompleteOptions, stream: boolean) {
    return {
      model: opts.model ?? this.defaultModel,
      messages,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens,
      stream,
      ...(stream ? { stream_options: { include_usage: true } } : {}),
      ...(opts.json && this.jsonModeSupported ? { response_format: { type: "json_object" } } : {}),
    };
  }

  private async post(body: unknown): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${this.base}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.key}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(Number(process.env.LLM_TIMEOUT_MS ?? 600_000)),
        });
      } catch (err) {
        if (attempt >= 4) throw err;
        await sleep(2000 * 2 ** attempt);
        continue;
      }
      if (res.ok) return res;
      const text = await res.text().catch(() => "");
      if (res.status === 400 && /response_format/i.test(text) && this.jsonModeSupported) {
        this.jsonModeSupported = false;
        const b = body as Record<string, unknown>;
        delete b.response_format;
        continue;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 5) {
        await sleep(3000 * 2 ** attempt);
        continue;
      }
      throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 400)}`);
    }
  }

  private usage(model: string, u: Record<string, any> | undefined): LlmUsage {
    const input = u?.prompt_tokens ?? 0;
    const cachedInput = u?.prompt_cache_hit_tokens ?? u?.prompt_tokens_details?.cached_tokens ?? 0;
    const output = u?.completion_tokens ?? 0;
    return { input, cachedInput, output, costUsd: llmCostUsd(model, { input, cachedInput, output }) };
  }

  async complete(messages: ChatMessage[], opts: CompleteOptions = {}) {
    const body = this.body(messages, opts, false);
    const res = await this.post(body);
    const j = (await res.json()) as any;
    const model = j.model ?? body.model;
    return { text: j.choices?.[0]?.message?.content ?? "", usage: this.usage(body.model, j.usage), model };
  }

  async *stream(messages: ChatMessage[], opts: CompleteOptions = {}) {
    const body = this.body(messages, opts, true);
    const res = await this.post(body);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let usage: LlmUsage | null = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const j = JSON.parse(data);
          const delta = j.choices?.[0]?.delta?.content;
          if (delta) yield { delta };
          if (j.usage) usage = this.usage(body.model, j.usage);
        } catch {
          /* keep-alive or partial line */
        }
      }
    }
    yield { usage: usage ?? { input: 0, cachedInput: 0, output: 0, costUsd: 0 }, model: body.model };
  }
}

/** Parse a JSON object out of a model reply (tolerates code fences and stray prose). */
export function parseJsonReply<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("model reply contains no JSON object");
  return JSON.parse(raw.slice(start, end + 1)) as T;
}

/** Pull <tag>…</tag> sections out of a long-form reply. */
export function parseTagged(text: string, tags: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tag of tags) {
    const m = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
    if (m) out[tag] = m[1].trim();
  }
  return out;
}

/** Rough token estimate (crypto text is symbol-heavy, so be conservative). */
export const estimateTokens = (s: string) => Math.ceil(s.length / 3.2);
