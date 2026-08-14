import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { SalesAgentRequestSchema, SalesRecommendationsSchema, type SalesAgentRequest, type SalesRecommendations } from "./contracts";
import { deterministicRecommendations, finalizeModelRecommendations } from "./orchestrator";

const MAX_REQUEST_BYTES = 96_000;
const TIMEOUT_MS = 20_000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1_000;
const RATE_LIMIT_REQUESTS = 6;
const requestsByIp = new Map<string, number[]>();

export type RecommendationGenerator = (input: SalesAgentRequest, signal: AbortSignal) => Promise<unknown>;

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

async function generateWithOpenAI(input: SalesAgentRequest, signal: AbortSignal, apiKey: string): Promise<SalesRecommendations> {
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
      "Use needs_data_review or research when the supplied evidence does not support outreach. Do not recommend automated outreach.",
    ].join(" "),
    input: JSON.stringify(input),
    text: { format: zodTextFormat(SalesRecommendationsSchema, "sales_account_recommendations") },
    max_output_tokens: 4_500,
  }, { signal });

  if (!response.output_parsed) throw new Error("Structured recommendation output was empty.");
  return response.output_parsed;
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
  const fallback = deterministicRecommendations(parsed.data);

  if (!dependencies.skipRateLimit && !withinRateLimit(clientIp(request), (dependencies.now ?? Date.now)())) {
    return json({ recommendations: fallback, source: "fallback", warning: "Recommendation request limit reached. Showing the deterministic action plan." }, 429);
  }

  const apiKey = dependencies.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey && !dependencies.generate) return json({ recommendations: fallback, source: "fallback", warning: "AI recommendations are not configured. Showing the deterministic action plan." });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const generated = await (dependencies.generate ? dependencies.generate(parsed.data, controller.signal) : generateWithOpenAI(parsed.data, controller.signal, apiKey as string));
    return json({ recommendations: finalizeModelRecommendations(parsed.data, generated), source: "ai" });
  } catch (error) {
    const warning = error instanceof Error && error.name === "AbortError"
      ? "AI recommendations timed out. Showing the deterministic action plan."
      : "AI recommendations are temporarily unavailable. Showing the deterministic action plan.";
    return json({ recommendations: fallback, source: "fallback", warning });
  } finally {
    clearTimeout(timeout);
  }
}
