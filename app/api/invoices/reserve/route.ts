import { handleRouteError, jsonResponse } from "@/lib/http";
import { reserveInvoiceNumber } from "@/lib/invoice-numbers";

export const runtime = "nodejs";

/** Reserve the next invoice number immediately before client-side PDF work. */
export async function POST() {
  try {
    return jsonResponse({ invoiceNumber: await reserveInvoiceNumber() }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}

