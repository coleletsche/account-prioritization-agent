import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { BriefingRequestSchema, WeeklyBriefingSchema, deterministicBriefing, type BriefingRequest, type WeeklyBriefing } from "./briefing";

const MAX_REQUEST_BYTES = 64_000;
const TIMEOUT_MS = 12_000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1_000;
const RATE_LIMIT_REQUESTS = 5;
const requestsByIp = new Map<string, number[]>();

type BriefingGenerator = (input: BriefingRequest, signal: AbortSignal) => Promise<unknown>;

interface HandlerDependencies {
  apiKey?: string;
  generate?: BriefingGenerator;
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

async function generateWithOpenAI(input: BriefingRequest, signal: AbortSignal, apiKey: string): Promise<WeeklyBriefing> {
  const client = new OpenAI({ apiKey });
  const response = await client.responses.parse({
    model: "gpt-5.4-nano",
    store: false,
    instructions: [
      "Create a concise Monday sales briefing from the supplied ranked-account summaries only.",
      "Ranks and scores are fixed deterministic inputs: never change them, recommend a different order, or invent evidence.",
      "Never describe the priority score as a probability, propensity, forecast, or predicted conversion likelihood.",
      "Do not infer facts about an organization beyond the input. Mention data quality directly when it affects confidence.",
    ].join(" "),
    input: JSON.stringify(input),
    text: { format: zodTextFormat(WeeklyBriefingSchema, "weekly_sales_briefing") },
    max_output_tokens: 650,
  }, { signal });

  if (!response.output_parsed) throw new Error("Structured briefing output was empty.");
  return response.output_parsed;
}

export async function handleBriefingRequest(request: Request, dependencies: HandlerDependencies = {}): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) return json({ error: "Briefing payload is too large." }, 413);

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) return json({ error: "Briefing payload is too large." }, 413);

  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    return json({ error: "Briefing payload must be valid JSON." }, 400);
  }

  const parsed = BriefingRequestSchema.safeParse(candidate);
  if (!parsed.success) return json({ error: "Briefing payload is invalid.", details: parsed.error.issues.map((issue) => issue.message) }, 400);
  const fallback = deterministicBriefing(parsed.data);

  if (!dependencies.skipRateLimit && !withinRateLimit(clientIp(request), (dependencies.now ?? Date.now)())) {
    return json({ briefing: fallback, source: "fallback", warning: "Briefing request limit reached. Showing the deterministic summary." }, 429);
  }

  const apiKey = dependencies.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey && !dependencies.generate) return json({ briefing: fallback, source: "fallback", warning: "AI briefing is not configured. Showing the deterministic summary." });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const result = await (dependencies.generate ? dependencies.generate(parsed.data, controller.signal) : generateWithOpenAI(parsed.data, controller.signal, apiKey as string));
    const briefing = WeeklyBriefingSchema.safeParse(result);
    if (!briefing.success) throw new Error("Briefing output failed validation.");
    return json({ briefing: briefing.data, source: "ai" });
  } catch (error) {
    const warning = error instanceof Error && error.name === "AbortError"
      ? "AI briefing timed out. Showing the deterministic summary."
      : "AI briefing is temporarily unavailable. Showing the deterministic summary.";
    return json({ briefing: fallback, source: "fallback", warning });
  } finally {
    clearTimeout(timeout);
  }
}
