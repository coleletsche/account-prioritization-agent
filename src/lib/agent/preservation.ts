import { type SalesAgentApiResponse, type SalesAgentRequest } from "./contracts";
import { deterministicRecommendations } from "./orchestrator";

export function preserveCompatiblePlans(
  previousRequest: SalesAgentRequest,
  nextRequest: SalesAgentRequest,
  previousResponse: SalesAgentApiResponse,
): SalesAgentApiResponse {
  const previousAccounts = new Map(previousRequest.accounts.map((account) => [account.account_id, JSON.stringify(account)]));
  const previousGenerated = new Set(previousResponse.generated_account_ids);
  const previousRecommendations = new Map(previousResponse.recommendations.map((recommendation) => [recommendation.account_id, recommendation]));
  const retainedIds = new Set(nextRequest.accounts
    .filter((account) => previousGenerated.has(account.account_id) && previousAccounts.get(account.account_id) === JSON.stringify(account))
    .map((account) => account.account_id));
  const recommendations = deterministicRecommendations(nextRequest).map((recommendation) => retainedIds.has(recommendation.account_id)
    ? previousRecommendations.get(recommendation.account_id) ?? recommendation
    : recommendation);
  const generatedAccountIds = nextRequest.accounts.map((account) => account.account_id).filter((id) => retainedIds.has(id));
  const ai = generatedAccountIds.length;
  const fallback = recommendations.length - ai;
  return {
    recommendations,
    generated_account_ids: generatedAccountIds,
    source: fallback === 0 ? "ai" : ai > 0 ? "mixed" : "fallback",
    coverage: { total: recommendations.length, ai, fallback },
    ...(fallback > 0 ? { warning: `${fallback} AI ${fallback === 1 ? "plan needs" : "plans need"} regeneration after data reconciliation.` } : {}),
  };
}
