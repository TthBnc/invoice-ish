import { NextResponse } from "next/server";

import { DatabaseConfigurationError } from "@/lib/db";
import { hasValidAdminSession } from "@/lib/auth";
import { InvoiceNumberSequenceError } from "@/lib/invoice-numbers";
import { ProfileNameConflictError } from "@/lib/profiles";

export function jsonResponse<T>(body: T, status = 200, headers: HeadersInit = {}): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

export function errorResponse(message: string, status: number, details?: unknown): NextResponse {
  return jsonResponse(
    details === undefined ? { error: message } : { error: message, details },
    status,
  );
}

export function unauthorizedResponse(): NextResponse {
  return errorResponse("Admin authentication is required", 401);
}

export function requireAdmin(request: Request): NextResponse | undefined {
  return hasValidAdminSession(request) ? undefined : unauthorizedResponse();
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export function validationError(error: { flatten: () => unknown }): NextResponse {
  return errorResponse("Invalid request", 400, error.flatten());
}

export function handleRouteError(error: unknown): NextResponse {
  if (error instanceof ProfileNameConflictError) {
    return errorResponse(error.message, 409);
  }

  if (error instanceof DatabaseConfigurationError) {
    return errorResponse("The database is not configured", 503);
  }

  if (error instanceof InvoiceNumberSequenceError) {
    return errorResponse(error.message, 503);
  }

  if (error instanceof Error && error.name === "AuthConfigurationError") {
    return errorResponse("Admin authentication is not configured", 503);
  }

  console.error("API route error", error);
  return errorResponse("An unexpected server error occurred", 500);
}
