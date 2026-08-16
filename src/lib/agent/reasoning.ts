import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { SalesAgentBatchRequestSchema, SalesAgentRequestSchema, SalesRecommendationsSchema, type AccountRecommendation, type SalesAgentBatchRequest, type SalesAgentRequest, type SalesRecommendations } from "./contracts";
import { deterministicRecommendations, finalizeModelRecommendations } from "./orchestrator";

const MAX_REQUEST_BYTES = 2_000_000;
const TIMEOUT_MS = 20_000;
const MODEL_BATCH_SIZE = 40;
const MODEL_CONCURRENCY = 3;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1_000;
const RATE_LIMIT_REQUESTS = 60;
const requestsByIp = new Map<string, number[]>();

export type RecommendationGenerator = (input: SalesAgentBatchRequest, signal: AbortSignal) => Promise<unknown>;

export interface SalesAgentHandlerDependencies {
  apiKey?: string;
  generate?: RecommendationGenerator;
  now?: () => number;
  skipRateLimit?: boolean;
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

function withinRateLimit(ip: string, now: number): boolean {
  const recent = (requestsByIp.get(ip) ?? []).filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_REQUESTS) {
    requestsByIp.set(ip, recent);
    return false;
  }
  requestsByIp.set(ip, [...recent, now]);
  return true;
}

async function generateWithOpenAI(input: SalesAgentBatchRequest, signal: AbortSignal, apiKey: string): Promise<SalesRecommendations> {
  const client = new OpenAI({ apiKey });
  const response = await client.responses.parse({
    model: "gpt-5.4-nano",
    store: false,
    instructions: [
      "Interpret each supplied ranked sales account and recommend the next action using only the provided facts.",
      "The deterministic rank, scores, priority band, validation status, identity result, and suppression status are authoritative.",
      "Never calculate, estimate, change, compare, or override a score, rank, priority band, validation result, or policy decision.",
      "Never describe a score as a probability, propensity, forecast, or predicted conversion likelihood.",
      "Return each supplied account_id exactly once and do not invent accounts, events, people, products, or business context.",
      "Keep why_now and call_angle concise, concrete, and explicit about missing or warning-level evidence.",
      "Write why_now in natural seller-facing language. Do not repeat ranks, scores, priority bands, booleans, schema names, or raw field names.",
      "Lead why_now with observed engagement and timing. Mention a data warning only when it changes the action or confidence, and never mention that contact suppression is false or absent.",
      "Use call_angle as a compact call plan: give the rep a grounded opener followed by one useful discovery question.",
      "Use needs_data_review or research when the supplied evidence does not support outreach. Do not recommend automated outreach.",
    ].join(" "),
    input: JSON.stringify(input),
    text: { format: zodTextFormat(SalesRecommendationsSchema, "sales_account_recommendations") },
    max_output_tokens: 8_000,
  }, { signal });

  if (!response.output_parsed) throw new Error("Structured recommendation output was empty.");
  return response.output_parsed;
}

function batchesFor(input: SalesAgentRequest): SalesAgentBatchRequest[] {
  const batches: SalesAgentBatchRequest[] = [];
  for (let index = 0; index < input.accounts.length; index += MODEL_BATCH_SIZE) {
    batches.push(SalesAgentBatchRequestSchema.parse({ as_of_date: input.as_of_date, accounts: input.accounts.slice(index, index + MODEL_BATCH_SIZE) }));
  }
  return batches;
}

async function runWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

async function generateBatch(
  input: SalesAgentBatchRequest,
  generate: RecommendationGenerator,
): Promise<{ recommendations: AccountRecommendation[]; source: "ai" | "fallback"; timedOut: boolean }> {
  const fallback = deterministicRecommendations(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const generated = await generate(input, controller.signal);
    return { recommendations: finalizeModelRecommendations(input, generated), source: "ai", timedOut: false };
  } catch (error) {
    return { recommendations: fallback, source: "fallback", timedOut: error instanceof Error && error.name === "AbortError" };
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackResponse(input: SalesAgentRequest, warning: string) {
  return {
    recommendations: deterministicRecommendations(input),
    generated_account_ids: [],
    source: "fallback" as const,
    coverage: { total: input.accounts.length, ai: 0, fallback: input.accounts.length },
    warning,
  };
}

export async function handleSalesAgentRequest(request: Request, dependencies: SalesAgentHandlerDependencies = {}): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) return json({ error: "Recommendation payload is too large." }, 413);

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) return json({ error: "Recommendation payload is too large." }, 413);

  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    return json({ error: "Recommendation payload must be valid JSON." }, 400);
  }

  const parsed = SalesAgentRequestSchema.safeParse(candidate);
  if (!parsed.success) return json({ error: "Recommendation payload is invalid.", details: parsed.error.issues.map((issue) => issue.message) }, 400);
  if (!dependencies.skipRateLimit && !withinRateLimit(clientIp(request), (dependencies.now ?? Date.now)())) {
    return json(fallbackResponse(parsed.data, "AI plan request limit reached. No new plans were generated."), 429);
  }

  const apiKey = dependencies.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey && !dependencies.generate) return json(fallbackResponse(parsed.data, "AI plan generation is not configured. No plans were generated."));

  const generate = dependencies.generate ?? ((input: SalesAgentBatchRequest, signal: AbortSignal) => generateWithOpenAI(input, signal, apiKey as string));
  const results = await runWithConcurrency(batchesFor(parsed.data), MODEL_CONCURRENCY, (batch) => generateBatch(batch, generate));
  const recommendations = results.flatMap((result) => result.recommendations);
  const generatedAccountIds = results.filter((result) => result.source === "ai").flatMap((result) => result.recommendations.map((recommendation) => recommendation.account_id));
  const ai = results.filter((result) => result.source === "ai").reduce((total, result) => total + result.recommendations.length, 0);
  const fallback = recommendations.length - ai;
  const source = ai === recommendations.length ? "ai" : ai > 0 ? "mixed" : "fallback";
  const warning = fallback === 0
    ? undefined
    : ai > 0
      ? `AI plans were generated for ${ai} of ${recommendations.length} accounts. The remaining ${fallback} are ready to retry.`
      : results.some((result) => result.timedOut)
        ? "AI plan generation timed out. No generated plan was saved for the affected accounts."
        : "AI plan generation is temporarily unavailable. No plans were generated.";
  return json({ recommendations, generated_account_ids: generatedAccountIds, source, coverage: { total: recommendations.length, ai, fallback }, ...(warning ? { warning } : {}) });
}
