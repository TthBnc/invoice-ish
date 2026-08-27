import { hasValidAdminSession } from "@/lib/auth";
import { jsonResponse } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return jsonResponse({ authenticated: hasValidAdminSession(request) });
}

