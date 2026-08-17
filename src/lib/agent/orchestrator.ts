import { SalesRecommendationsSchema, type AccountRecommendation, type SalesAgentRequest } from "./contracts";
import { deterministicRecommendation, enforceRecommendationPolicy } from "./policy";

export function deterministicRecommendations(input: SalesAgentRequest): AccountRecommendation[] {
  return input.accounts.map(deterministicRecommendation);
}

export function finalizeModelRecommendations(input: SalesAgentRequest, candidate: unknown): AccountRecommendation[] {
  const parsed = SalesRecommendationsSchema.parse(candidate);
  const expectedIds = new Set(input.accounts.map((account) => account.account_id));
  const receivedIds = parsed.recommendations.map((recommendation) => recommendation.account_id);
  if (new Set(receivedIds).size !== receivedIds.length) throw new Error("Model returned duplicate account recommendations.");
  if (receivedIds.length !== expectedIds.size || receivedIds.some((id) => !expectedIds.has(id))) throw new Error("Model recommendations did not match the requested account IDs.");

  const recommendations = new Map(parsed.recommendations.map((recommendation) => [recommendation.account_id, recommendation]));
  return input.accounts.map((account) => enforceRecommendationPolicy(account, recommendations.get(account.account_id) as AccountRecommendation));
}
