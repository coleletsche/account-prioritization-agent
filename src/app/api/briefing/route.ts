import { handleBriefingRequest } from "@/lib/briefing-route";

export async function POST(request: Request) {
  return handleBriefingRequest(request);
}
