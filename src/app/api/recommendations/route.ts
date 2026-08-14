import { handleSalesAgentRequest } from "@/lib/agent/reasoning";

export async function POST(request: Request) {
  return handleSalesAgentRequest(request);
}
