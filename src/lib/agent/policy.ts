import { EVENT_WEIGHTS } from "../scoring";
import type { AccountRecommendation, AgentAccount } from "./contracts";

const ACTION_BY_BAND = {
  P0: { recommended_action: "call_today", urgency: "immediate" },
  P1: { recommended_action: "call_this_week", urgency: "high" },
  P2: { recommended_action: "email", urgency: "medium" },
  P3: { recommended_action: "nurture", urgency: "low" },
} as const;

function deterministicCallAngle(account: AgentAccount): string {
  const strongest = [...account.engagement_timeline]
    .filter((signal) => signal.scored)
    .sort((left, right) => EVENT_WEIGHTS[right.event_type] - EVENT_WEIGHTS[left.event_type] || right.event_date.localeCompare(left.event_date))[0];
  if (strongest?.event_type === "demo_request") return `Lead with the ${strongest.event_date} demo request and ask what outcome prompted the evaluation.`;
  if (strongest?.event_type === "webinar") return `Reference the ${strongest.event_date} webinar engagement and ask which topic is most relevant to the account’s current work.`;
  if (strongest?.event_type === "content_download") return `Follow up on the ${strongest.event_date} content download and connect it to a concrete discovery question.`;
  if (strongest?.event_type === "page_visit") return `Use the recent site activity as a light opener, then validate whether there is an active initiative.`;
  if (strongest?.event_type === "email_open") return `Re-engage around the prior email topic and ask one direct qualification question.`;
  const valueContext = account.tier ? `${account.tier} fit` : account.arr !== null ? "recorded account value" : "the available CRM profile";
  return `Use ${valueContext} to open a discovery conversation; do not imply recent intent that is not present.`;
}

export function deterministicRecommendation(account: AgentAccount): AccountRecommendation {
  const bandPolicy = ACTION_BY_BAND[account.scores.priority_band];
  const confidence = account.data_status === "valid" ? "high" : account.data_status === "warning" ? "medium" : "low";
  return enforceRecommendationPolicy(account, {
    account_id: account.account_id,
    why_now: `${account.scores.priority_band} at ${account.scores.priority_score.toFixed(1)}. ${account.deterministic_reason}`,
    recommended_action: bandPolicy.recommended_action,
    urgency: bandPolicy.urgency,
    call_angle: deterministicCallAngle(account),
    confidence,
  });
}

export function enforceRecommendationPolicy(account: AgentAccount, recommendation: AccountRecommendation): AccountRecommendation {
  // Run after model parsing as a deterministic final gate. Model text can never
  // bypass unresolved identity, blocked data, or explicit contact suppression.
  if (!account.identity_resolved || account.data_status === "blocked") {
    return {
      account_id: account.account_id,
      why_now: "Outreach is blocked because critical data or account identity requires human review.",
      recommended_action: "needs_data_review",
      urgency: "none",
      call_angle: "Resolve the blocking review-queue evidence before contacting this account.",
      confidence: "low",
    };
  }
  if (account.contact_suppressed === true) {
    return {
      account_id: account.account_id,
      why_now: "The CRM explicitly marks this account as contact-suppressed.",
      recommended_action: "no_action",
      urgency: "none",
      call_angle: "Do not contact. Confirm suppression ownership and status in the CRM if it appears incorrect.",
      confidence: "high",
    };
  }
  return { ...recommendation, account_id: account.account_id };
}
