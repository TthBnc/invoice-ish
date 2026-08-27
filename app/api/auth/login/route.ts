import { NextResponse } from "next/server";

import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSessionToken,
  isCorrectAdminPassword,
} from "@/lib/auth";
import { handleRouteError, jsonResponse, readJsonBody, validationError } from "@/lib/http";
import { adminLoginSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const body = await readJsonBody(request);
  const parsed = adminLoginSchema.safeParse(body);

  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    if (!isCorrectAdminPassword(parsed.data.password)) {
      return jsonResponse({ error: "Invalid admin password" }, 401);
    }

    const response = jsonResponse({ authenticated: true });
    response.cookies.set({
      name: ADMIN_SESSION_COOKIE,
      value: createAdminSessionToken(),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ADMIN_SESSION_TTL_SECONDS,
    });
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}

