import { handleResearchRequest } from "@/server/research/http";

export async function POST(request: Request) {
  return handleResearchRequest(request);
}
