import { handleLedgerPost } from "@/lib/ledger-api";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return handleLedgerPost(request, id, "payment");
}

